import Steel from 'steel-sdk';
import { chromium, type Browser, type Page } from 'playwright';
import { BrowserBatchSchema, QueryPlanSchema } from '@allabout/contracts';
import {
  assertAllowedUrl,
  looksBlocked,
  looksLikeAuthentication,
  readVisibleText,
} from './page-tools.ts';
import type {
  BrowserBatch,
  BrowserSignal,
  PageSnapshot,
  QueryPlan,
  SourceConfig,
  SourceFailure,
} from '@allabout/contracts';

export type * from '@allabout/contracts';
export { assertAllowedUrl, readLinks, readVisibleText } from './page-tools.ts';

const MIN_TEXT_LENGTH = 100;
const MAX_SESSION_MS = 5 * 60_000;

export async function collectPages(
  plan: QueryPlan,
  emit: (signal: BrowserSignal) => void,
  signal: AbortSignal,
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
    const session = await client.sessions.create({
      timeout: Math.min(Math.max(plan.budget.timeoutMs, 30_000), MAX_SESSION_MS),
    });
    createdSessionId = session.id;
    throwIfAborted(combinedSignal);

    const viewerUrl = new URL(session.debugUrl);
    viewerUrl.searchParams.set('interactive', 'false');
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
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await collectTarget(page, target, plan, combinedSignal, emit, () => {
            stepCount += 1;
          }, pages);
          finalFailure = null;
          break;
        } catch (error) {
          debugBrowserError(target.id, error, steelAPIKey);
          finalFailure = classifyTargetError(target.id, error, signal, timeoutController);
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

async function collectTarget(
  page: Page,
  target: SourceConfig,
  plan: QueryPlan,
  signal: AbortSignal,
  emit: (signal: BrowserSignal) => void,
  countStep: () => void,
  pages: PageSnapshot[],
): Promise<void> {
  if (target.access !== 'public') {
    throw new BrowserTargetError(
      target.access === 'authorized' ? 'AUTH_REQUIRED' : 'UNSUPPORTED_SOURCE',
      target.access === 'authorized'
        ? 'This source requires a separately authorized browser session.'
        : 'This source has not been configured for browser access.',
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

  const finalUrl = assertAllowedUrl(page.url(), target.allowedHosts);
  const body = await page.locator('body').innerText({ timeout: 5_000 });
  const title = await page.title();
  const status = response?.status() ?? null;

  if (looksBlocked(status, title, body)) {
    throw new BrowserTargetError('ACCESS_BLOCKED', 'The source returned an access check or block page.', true);
  }
  if (looksLikeAuthentication(status, finalUrl.href)) {
    throw new BrowserTargetError('AUTH_REQUIRED', 'The source redirected to an authentication page.', false);
  }
  if (status !== null && status >= 400) {
    throw new BrowserTargetError('NAVIGATION_FAILED', `The source returned HTTP ${status}.`, status >= 500);
  }

  countStep();
  emit({ type: 'step', sourceId: target.id, action: 'read_visible_text', url: finalUrl.href });
  const read = await readVisibleText(page);
  if (read.text.length < MIN_TEXT_LENGTH) {
    throw new BrowserTargetError('NO_MATCH', 'The page did not expose enough visible text to use.', true);
  }

  const snapshot: PageSnapshot = {
    id: `${plan.runId}:${target.id}:${pages.length + 1}`,
    sourceId: target.id,
    url: finalUrl.href,
    title: read.title,
    text: read.text,
    fetchedAt: new Date().toISOString(),
    publishedAt: read.publishedAt,
    updatedAt: read.updatedAt,
    scope: { ...target.scope },
    kind: target.kind,
    contentMode: target.contentMode,
  };
  pages.push(snapshot);
  emit({ type: 'page_read', snapshot });
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
