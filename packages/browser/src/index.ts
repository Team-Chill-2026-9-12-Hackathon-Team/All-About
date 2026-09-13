import Steel from 'steel-sdk';
import { chromium, type Browser, type Page } from 'playwright';
import { BrowserBatchSchema, QueryPlanSchema } from '@allabout/contracts';
import { fallbackUrlFor, shouldUseFallback } from './fallbacks.js';
import { attemptCredentialLogin, type CredentialResolver } from './login.js';
import {
  assertAllowedUrl,
  looksBlocked,
  looksLikeAuthentication,
  readLinks,
  readVisibleText,
} from './page-tools.js';
import type {
  BrowserBatch,
  BrowserSignal,
  PageSnapshot,
  QueryPlan,
  SourceConfig,
  SourceFailure,
} from '@allabout/contracts';

export type * from '@allabout/contracts';
export { assertAllowedUrl, readLinks, readVisibleText } from './page-tools.js';
export { attemptCredentialLogin, loginHostsFor, type CredentialResolver } from './login.js';

const MIN_TEXT_LENGTH = 100;
const MAX_SESSION_MS = 5 * 60_000;
// Live View is an audit surface, not a slideshow. Long artificial holds made
// a three-source query wait roughly 17 seconds after content was already read.
const CAPTURED_PAGE_HOLD_MS = 500;
const FINAL_VIEWER_HOLD_MS = 800;
const DEFAULT_REDDIT_USER_AGENT =
  'AllAboutCampus/0.1 (read-only RSS; contact: allabout-campus@users.noreply.github.com)';

export async function collectPages(
  plan: QueryPlan,
  emit: (signal: BrowserSignal) => void,
  signal: AbortSignal,
  resolveCredential?: CredentialResolver,
): Promise<BrowserBatch> {
  QueryPlanSchema.parse(plan);
  validatePlan(plan);

  const pages: PageSnapshot[] = [];
  const failures: SourceFailure[] = [];
  if (signal.aborted) {
    for (const target of plan.targets.slice(0, plan.budget.maxPages)) {
      addFailure(failures, emit, cancelled(target.id));
    }
    return BrowserBatchSchema.parse({ pages, failures, cleanup: 'not_created' });
  }

  const steelAPIKey = process.env.STEEL_API_KEY;
  if (!steelAPIKey) throw new Error('STEEL_API_KEY is required.');

  const timeoutController = new AbortController();
  const timeout = setTimeout(
    () => timeoutController.abort(new DOMException('Query budget expired.', 'TimeoutError')),
    plan.budget.timeoutMs,
  );
  const combinedSignal = AbortSignal.any([signal, timeoutController.signal]);
  const client = new Steel({
    steelAPIKey,
    maxRetries: 0,
    timeout: 25_000,
  });
  let createdSessionId: string | null = null;
  let browser: Browser | undefined;
  let cleanup: BrowserBatch['cleanup'] = 'not_created';
  let stepCount = 0;

  const closeOnAbort = () => {
    void browser?.close().catch(() => undefined);
  };
  combinedSignal.addEventListener('abort', closeOnAbort, { once: true });

  try {
    // Wait for the create response even if the run is cancelled so we retain
    // the deployment-generated session ID and can release it immediately.
    const session = await createSessionWithRetry(client, plan, combinedSignal);
    createdSessionId = session.id;
    throwIfAborted(combinedSignal);

    const viewerUrl = new URL(session.debugUrl);
    viewerUrl.searchParams.set(
      'interactive',
      plan.targets.some((target) => target.access === 'authorized') ? 'true' : 'false',
    );
    emit({ type: 'session_ready', viewerUrl: viewerUrl.href });

    const cdpUrl = new URL('wss://connect.steel.dev');
    cdpUrl.searchParams.set('apiKey', steelAPIKey);
    cdpUrl.searchParams.set('sessionId', session.id);
    browser = await chromium.connectOverCDP(cdpUrl.href, {
      timeout: Math.min(25_000, remainingMs(plan, timeoutController)),
    });

    const context = browser.contexts()[0];
    if (!context) throw new Error('Steel session did not expose its default browser context.');
    const page = context.pages()[0] ?? (await context.newPage());

    for (const target of plan.targets.slice(0, plan.budget.maxPages)) {
      if (combinedSignal.aborted) {
        addFailure(failures, emit, failureForAbort(target.id, signal, timeoutController));
        continue;
      }

      if (stepCount + 2 > plan.budget.maxSteps) {
        addFailure(failures, emit, {
          sourceId: target.id,
          code: 'NO_MATCH',
          message: 'The browser step budget was exhausted before this source could be read.',
          retryable: true,
        });
        continue;
      }

      let finalFailure: SourceFailure | null = null;
      let activeTarget = target;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          if (isRedditRssTarget(activeTarget)) {
            await collectRedditRss(
              activeTarget,
              plan,
              combinedSignal,
              emit,
              () => {
                stepCount += 1;
              },
              pages,
            );
          } else {
            await collectTarget(page, activeTarget, plan, combinedSignal, emit, () => {
              stepCount += 1;
            }, pages, resolveCredential);
          }
          finalFailure = null;
          break;
        } catch (error) {
          debugBrowserError(target.id, error, steelAPIKey);
          finalFailure = classifyTargetError(target.id, error, signal, timeoutController);
          const fallback = fallbackUrlFor(target.id, activeTarget.entryUrl);
          if (
            attempt === 0 &&
            fallback &&
            shouldUseFallback(finalFailure.code) &&
            !combinedSignal.aborted &&
            stepCount + 2 <= plan.budget.maxSteps
          ) {
            emit({ type: 'step', sourceId: target.id, action: 'fallback_source', url: fallback });
            activeTarget = { ...target, entryUrl: fallback };
            continue;
          }
          const canRetry =
            attempt === 0 &&
            finalFailure.retryable &&
            !combinedSignal.aborted &&
            stepCount + 2 <= plan.budget.maxSteps;
          if (!canRetry) break;
        }
      }
      if (finalFailure) {
        addFailure(failures, emit, finalFailure);
      }
    }

    const primary = pickPrimaryPage(plan, pages);
    if (primary && !combinedSignal.aborted) {
      emit({ type: 'step', sourceId: primary.sourceId, action: 'navigate', url: primary.url });
      await page.goto(primary.url, {
        waitUntil: 'domcontentloaded',
        timeout: Math.min(15_000, remainingMs(plan, timeoutController)),
      }).catch(() => undefined);
      emit({ type: 'step', sourceId: primary.sourceId, action: 'hold_for_viewer', url: primary.url });
      try {
        await holdForViewer(FINAL_VIEWER_HOLD_MS, combinedSignal);
      } catch {
        /* snapshots are already stored */
      }
    }

  } catch (error) {
    if (!combinedSignal.aborted) throw error;

    const resolvedSources = new Set([
      ...pages.map((page) => page.sourceId),
      ...failures.map((failure) => failure.sourceId),
    ]);
    for (const target of plan.targets.slice(0, plan.budget.maxPages)) {
      if (!resolvedSources.has(target.id)) {
        addFailure(failures, emit, failureForAbort(target.id, signal, timeoutController));
      }
    }
  } finally {
    clearTimeout(timeout);
    combinedSignal.removeEventListener('abort', closeOnAbort);
    await closeBrowser(browser);
    if (createdSessionId) {
      cleanup = await releaseSession(client, createdSessionId);
    }
  }

  return BrowserBatchSchema.parse({ pages, failures, cleanup });
}

function isRedditRssTarget(target: SourceConfig): boolean {
  return (
    new URL(target.entryUrl).hostname === 'www.reddit.com' &&
    new URL(target.entryUrl).pathname.endsWith('.rss')
  );
}

async function collectRedditRss(
  target: SourceConfig,
  plan: QueryPlan,
  signal: AbortSignal,
  emit: (signal: BrowserSignal) => void,
  countStep: () => void,
  pages: PageSnapshot[],
): Promise<void> {
  if (target.access !== 'public') {
    throw new BrowserTargetError('AUTH_REQUIRED', 'The Reddit RSS source must remain public.', false);
  }
  if (plan.input.mode === 'REPLAY') {
    throw new BrowserTargetError('UNSUPPORTED_SOURCE', 'Replay runs do not create live browser sessions.', false);
  }

  const entryUrl = assertAllowedUrl(target.entryUrl, target.allowedHosts);
  countStep();
  emit({ type: 'step', sourceId: target.id, action: 'fetch_public_rss', url: entryUrl.href });
  const response = await fetch(entryUrl.href, {
    headers: {
      accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8',
      'user-agent': process.env.REDDIT_USER_AGENT?.trim() || DEFAULT_REDDIT_USER_AGENT,
    },
    signal,
  });
  const body = await response.text();
  if (response.status === 401 || response.status === 403 || response.status === 429) {
    throw new BrowserTargetError(
      'ACCESS_BLOCKED',
      `Reddit RSS returned HTTP ${response.status}; retry later or use an approved Reddit OAuth client.`,
      false,
    );
  }
  if (!response.ok) {
    throw new BrowserTargetError('NAVIGATION_FAILED', `Reddit RSS returned HTTP ${response.status}.`, true);
  }
  const feed = parseRedditFeed(body);
  if (feed.text.length < MIN_TEXT_LENGTH) {
    throw new BrowserTargetError('NO_MATCH', 'Reddit RSS did not expose enough public post text.', true);
  }

  const fetchedAt = new Date().toISOString();
  const snapshot: PageSnapshot = {
    id: `${plan.runId}:${target.id}:${pages.length + 1}`,
    sourceId: target.id,
    url: entryUrl.href,
    title: feed.title || target.label,
    text: feed.text,
    fetchedAt,
    publishedAt: feed.publishedAt,
    updatedAt: feed.updatedAt,
    scope: { ...target.scope, entity: target.scope.entity ?? feed.title },
    kind: target.kind,
    contentMode: target.contentMode,
  };
  pages.push(snapshot);
  emit({ type: 'page_read', snapshot });
}

interface ParsedRedditFeed {
  title: string;
  text: string;
  publishedAt: string | null;
  updatedAt: string | null;
}

function parseRedditFeed(xml: string): ParsedRedditFeed {
  const entries = [...xml.matchAll(/<(?:entry|item)\b[\s\S]*?<\/(?:entry|item)>/gi)].slice(0, 25);
  const title = xmlTagText(xml, 'title') || 'Reddit public RSS feed';
  const lines = [`Feed: ${title}`];
  let publishedAt: string | null = null;
  let updatedAt: string | null = null;
  for (const [index, match] of entries.entries()) {
    const item = match[0];
    const itemTitle = xmlTagText(item, 'title') || `Post ${index + 1}`;
    const link = xmlLink(item);
    const summary = xmlTagText(item, 'summary') || xmlTagText(item, 'description') || xmlTagText(item, 'content');
    const dateRaw = xmlTagText(item, 'updated') || xmlTagText(item, 'pubDate') || xmlTagText(item, 'published');
    const date = dateRaw ? parseIsoDate(dateRaw) : null;
    if (!publishedAt && date) publishedAt = date;
    if (date) updatedAt = date;
    lines.push(`[${index + 1}] ${itemTitle}`);
    if (dateRaw) lines.push(`Posted: ${dateRaw}`);
    if (summary) lines.push(summary);
    if (link) lines.push(`Reddit link: ${link}`);
  }
  return { title, text: lines.join('\n'), publishedAt, updatedAt };
}

function xmlTagText(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!match?.[1]) return null;
  return decodeXml(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function xmlLink(xml: string): string | null {
  const href = xml.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*>/i)?.[1];
  if (href) return decodeXml(href).trim();
  return xml.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1]?.trim() || null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function parseIsoDate(value: string): string | null {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

async function createSessionWithRetry(
  client: Steel,
  plan: QueryPlan,
  signal: AbortSignal,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    throwIfAborted(signal);
    try {
      const interactive = plan.targets.some((target) => target.access === 'authorized');
      return await client.sessions.create({
        timeout: Math.min(Math.max(plan.budget.timeoutMs, 30_000), MAX_SESSION_MS),
        debugConfig: { interactive, systemCursor: interactive },
      });
    } catch (error) {
      lastError = error;
      if (attempt === 0) await holdForViewer(1_000, signal);
    }
  }
  throw lastError;
}

async function collectTarget(
  page: Page,
  target: SourceConfig,
  plan: QueryPlan,
  signal: AbortSignal,
  emit: (signal: BrowserSignal) => void,
  countStep: () => void,
  pages: PageSnapshot[],
  resolveCredential: CredentialResolver | undefined,
): Promise<void> {
  if (target.access === 'unconfigured') {
    throw new BrowserTargetError(
      'UNSUPPORTED_SOURCE',
      'This source has not been configured for browser access.',
      false,
    );
  }
  if (target.access === 'authorized' && resolveCredential === undefined) {
    throw new BrowserTargetError(
      'AUTH_REQUIRED',
      'This source requires a credential saved for its exact login domain.',
      false,
    );
  }
  if (plan.input.mode === 'REPLAY') {
    throw new BrowserTargetError(
      'UNSUPPORTED_SOURCE',
      'Replay runs do not create live browser sessions.',
      false,
    );
  }

  const entryUrl = assertAllowedUrl(target.entryUrl, target.allowedHosts);
  countStep();
  emit({ type: 'step', sourceId: target.id, action: 'navigate', url: entryUrl.href });
  throwIfAborted(signal);

  const response = await page.goto(entryUrl.href, {
    waitUntil: 'domcontentloaded',
    timeout: Math.min(20_000, Math.max(1, plan.budget.timeoutMs)),
  });
  await page.locator('body').waitFor({ timeout: 5_000 });
  await page
    .waitForFunction(() => (document.body?.innerText.trim().length ?? 0) > 150, {}, { timeout: 5_000 })
    .catch(() => undefined);
  throwIfAborted(signal);

  let currentUrl = page.url();
  let body = await page.locator('body').innerText({ timeout: 5_000 });
  let title = await page.title();
  let status = response?.status() ?? null;

  if (looksBlocked(status, title, body)) {
    throw new BrowserTargetError('ACCESS_BLOCKED', 'The source returned an access check or block page.', true);
  }

  let authenticated = false;
  if (target.access === 'authorized' || looksLikeAuthentication(status, currentUrl)) {
    if (resolveCredential === undefined) {
      throw new BrowserTargetError('AUTH_REQUIRED', 'No credential resolver is configured.', false);
    }
    countStep();
    emit({ type: 'step', sourceId: target.id, action: 'credential_login', url: currentUrl });
    const login = await attemptCredentialLogin(page, target, resolveCredential, signal);
    if (login.status !== 'authenticated') {
      emit({ type: 'step', sourceId: target.id, action: 'hold_for_viewer', url: currentUrl });
      try {
        await holdForViewer(2_000, signal);
      } catch {
        /* still report the login wall */
      }
      const message = login.status === 'credential_missing'
        ? 'No credential is saved for this portal or its sign-in host.'
        : 'The login form requires manual sign-in, MFA, or a site-specific adapter.';
      throw new BrowserTargetError('AUTH_REQUIRED', message, false);
    }
    authenticated = true;
    currentUrl = login.url;
    body = await page.locator('body').innerText({ timeout: 5_000 });
    title = await page.title();
    status = null;

    if (target.id === 'quercus-login') {
      await openMatchingQuercusContent(page, target, plan, signal, emit, countStep);
      currentUrl = page.url();
      body = await page.locator('body').innerText({ timeout: 5_000 });
      title = await page.title();
    }
  }

  const capturedUrl = assertAllowedUrl(currentUrl, target.allowedHosts);
  if (!authenticated && looksLikeAuthentication(status, capturedUrl.href)) {
    throw new BrowserTargetError('AUTH_REQUIRED', 'The source remained on an authentication page.', false);
  }
  if (status !== null && status >= 400) {
    throw new BrowserTargetError('NAVIGATION_FAILED', `The source returned HTTP ${status}.`, status >= 500);
  }

  countStep();
  emit({ type: 'step', sourceId: target.id, action: 'read_visible_text', url: capturedUrl.href });
  const read = await readVisibleText(page);
  if (read.text.length < MIN_TEXT_LENGTH) {
    throw new BrowserTargetError('NO_MATCH', 'The page did not expose enough visible text to use.', true);
  }

  const links = await readLinks(page, target.allowedHosts);
  const linkLines = links
    .filter((link) => /^https:\/\//.test(link.url))
    .slice(0, 20)
    .map((link) => `Visible link: ${link.text || '(untitled)'} ${link.url}`);
  const text = linkLines.length > 0 ? `${read.text}\n\n${linkLines.join('\n')}` : read.text;

  const snapshot: PageSnapshot = {
    id: `${plan.runId}:${target.id}:${pages.length + 1}`,
    sourceId: target.id,
    url: capturedUrl.href,
    title: read.title || target.label,
    text,
    fetchedAt: new Date().toISOString(),
    publishedAt: read.publishedAt,
    updatedAt: read.updatedAt,
    scope: { ...target.scope, entity: target.scope.entity ?? read.title },
    kind: target.kind,
    contentMode: target.contentMode,
  };
  pages.push(snapshot);
  emit({ type: 'page_read', snapshot });
  emit({ type: 'step', sourceId: target.id, action: 'hold_for_viewer', url: capturedUrl.href });
  try {
    await holdForViewer(CAPTURED_PAGE_HOLD_MS, signal);
  } catch {
    // The page is already captured; a cancelled hold must not drop the snapshot.
  }
}

async function openMatchingQuercusContent(
  page: Page,
  target: SourceConfig,
  plan: QueryPlan,
  signal: AbortSignal,
  emit: (signal: BrowserSignal) => void,
  countStep: () => void,
): Promise<void> {
  const course = plan.input.scope.course?.replace(/(?:H1|Y1)$/i, '') ?? '';
  if (!course) return;

  const courseNeedle = normalizeLinkMatch(course);
  const courseLinks = await readLinks(page, target.allowedHosts);
  const courseLink = courseLinks.find((link) =>
    normalizeLinkMatch(`${link.text} ${link.url}`).includes(courseNeedle),
  );
  if (!courseLink) return;

  await navigateWithinSource(page, courseLink.url, target, signal, emit, countStep, 'open_course');
  if (!/syllabus/i.test(plan.input.query)) return;

  const syllabusLinks = await readLinks(page, target.allowedHosts);
  const syllabusLink = syllabusLinks.find((link) =>
    /syllabus/i.test(`${link.text} ${link.url}`),
  );
  if (!syllabusLink) return;
  await navigateWithinSource(page, syllabusLink.url, target, signal, emit, countStep, 'open_syllabus');
}

async function navigateWithinSource(
  page: Page,
  rawUrl: string,
  target: SourceConfig,
  signal: AbortSignal,
  emit: (signal: BrowserSignal) => void,
  countStep: () => void,
  action: string,
): Promise<void> {
  const url = assertAllowedUrl(rawUrl, target.allowedHosts);
  throwIfAborted(signal);
  countStep();
  emit({type: 'step', sourceId: target.id, action, url: url.href});
  await page.goto(url.href, {waitUntil: 'domcontentloaded', timeout: 20_000});
  await page.locator('body').waitFor({timeout: 5_000});
  throwIfAborted(signal);
}

function normalizeLinkMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function holdForViewer(ms: number, signal: AbortSignal): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < ms) {
    throwIfAborted(signal);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

function validatePlan(plan: QueryPlan): void {
  if (!plan.runId.trim()) throw new Error('QueryPlan.runId is required.');
  if (!Number.isInteger(plan.budget.maxPages) || plan.budget.maxPages < 1) {
    throw new Error('QueryPlan.budget.maxPages must be a positive integer.');
  }
  if (!Number.isInteger(plan.budget.maxSteps) || plan.budget.maxSteps < 1) {
    throw new Error('QueryPlan.budget.maxSteps must be a positive integer.');
  }
  if (!Number.isFinite(plan.budget.timeoutMs) || plan.budget.timeoutMs < 1_000) {
    throw new Error('QueryPlan.budget.timeoutMs must be at least 1000.');
  }
}

function classifyTargetError(
  sourceId: string,
  error: unknown,
  callerSignal: AbortSignal,
  timeoutController: AbortController,
): SourceFailure {
  if (callerSignal.aborted) return cancelled(sourceId);
  if (timeoutController.signal.aborted) {
    return { sourceId, code: 'TIMEOUT', message: 'The query time budget expired.', retryable: true };
  }
  if (error instanceof BrowserTargetError) {
    return { sourceId, code: error.code, message: error.message, retryable: error.retryable };
  }
  if (error instanceof Error && error.name === 'TimeoutError') {
    return { sourceId, code: 'TIMEOUT', message: 'The source did not respond before the page timeout.', retryable: true };
  }
  return {
    sourceId,
    code: 'NAVIGATION_FAILED',
    message: 'The source could not be read by the browser.',
    retryable: true,
  };
}

function failureForAbort(
  sourceId: string,
  callerSignal: AbortSignal,
  timeoutController: AbortController,
): SourceFailure {
  return callerSignal.aborted
    ? cancelled(sourceId)
    : {
        sourceId,
        code: timeoutController.signal.aborted ? 'TIMEOUT' : 'CANCELLED',
        message: timeoutController.signal.aborted
          ? 'The query time budget expired.'
          : 'The browser run was cancelled.',
        retryable: true,
      };
}

function cancelled(sourceId: string): SourceFailure {
  return { sourceId, code: 'CANCELLED', message: 'The browser run was cancelled.', retryable: true };
}

function pickPrimaryPage(plan: QueryPlan, pages: PageSnapshot[]): PageSnapshot | undefined {
  const asked = plan.input.scope.course?.toLowerCase().replace(/h1|y1/g, "") ?? "";
  const official = pages.filter((page) => page.kind === "official");
  if (asked) {
    const match = official.find((page) => {
      const hay = `${page.url} ${page.title} ${page.scope.course ?? ""}`.toLowerCase();
      return hay.includes(asked);
    });
    if (match) return match;
  }
  return official[0] ?? pages[0];
}

function addFailure(
  failures: SourceFailure[],
  emit: (signal: BrowserSignal) => void,
  failure: SourceFailure,
): void {
  failures.push(failure);
  emit({ type: 'source_failed', failure });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new DOMException('Aborted.', 'AbortError');
}

function remainingMs(plan: QueryPlan, timeoutController: AbortController): number {
  return timeoutController.signal.aborted ? 1 : Math.max(1, Math.min(25_000, plan.budget.timeoutMs));
}

async function closeBrowser(browser: Browser | undefined): Promise<void> {
  if (!browser) return;
  await Promise.race([
    browser.close().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
  ]);
}

async function releaseSession(client: Steel, sessionId: string): Promise<BrowserBatch['cleanup']> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await client.sessions.release(sessionId, {}, { timeout: 10_000, maxRetries: 0 });
      const session = await client.sessions.retrieve(sessionId, { timeout: 10_000, maxRetries: 0 });
      if (session.status === 'released') return 'released';
    } catch {
      // One bounded retry. Raw SDK errors can contain credential-bearing URLs.
    }
  }
  return 'release_failed';
}

class BrowserTargetError extends Error {
  readonly code: SourceFailure['code'];
  readonly retryable: boolean;

  constructor(
    code: SourceFailure['code'],
    message: string,
    retryable: boolean,
  ) {
    super(message);
    this.name = 'BrowserTargetError';
    this.code = code;
    this.retryable = retryable;
  }
}

function debugBrowserError(sourceId: string, error: unknown, steelAPIKey: string): void {
  if (process.env.BROWSER_DEBUG !== '1') return;
  const name = error instanceof Error ? error.name : 'UnknownError';
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = rawMessage
    .split(steelAPIKey).join('[REDACTED]')
    .replace(/(?:https?|wss?):\/\/\S+/g, '[URL]')
    .slice(0, 1_000);
  console.error(JSON.stringify({ type: 'browser_debug', sourceId, name, message }));
}
