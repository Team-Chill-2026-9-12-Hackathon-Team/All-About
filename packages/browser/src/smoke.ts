/** T+0–1h probe only; not the shared collectPages adapter. No model or login. */
import Steel from 'steel-sdk';
import { chromium, type Browser } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const key = process.env.STEEL_API_KEY;
if (!key) { console.error('STEEL_API_KEY is required'); process.exit(1); }
const client = new Steel({ steelAPIKey: key, maxRetries: 0, timeout: 20_000 });
const eventsMode = process.env.SMOKE_SET === 'events';
const targets = eventsMode ? [
  ['xplore', 'https://harthouse.ca/events/xplore-hart-house/'],
  ['xplore-rules', 'https://harthouse.ca/doc/hh-fall-2026-orientation-contest-details'],
] as const : [
  ['csc207', 'https://artsci.calendar.utoronto.ca/course/csc207h1'],
  ['csc148', 'https://artsci.calendar.utoronto.ca/course/csc148h1'],
  ['academic-dates', 'https://www.artsci.utoronto.ca/current/dates-deadlines/academic-dates'],
  ['studentlife', 'https://www.studentlife.utoronto.ca/events/'],
] as const;
const out = new URL('../artifacts/', import.meta.url);
await mkdir(out, { recursive: true, mode: 0o700 });
const started = Date.now();
let browser: Browser | undefined;
let creationAttempted = false;
let createdSessionId: string | null = null;
let cleanup = 'not_created';
let viewerAvailable = false;
let sessionCreated = false;
const results: Record<string, unknown>[] = [];
let interrupted = false;
const interrupt = () => { interrupted = true; void browser?.close().catch(() => {}); };
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
try {
  creationAttempted = true;
  const session = await client.sessions.create({ timeout: 180_000 });
  createdSessionId = session.id;
  sessionCreated = true;
  const viewer = new URL(session.debugUrl);
  viewer.searchParams.set('interactive', 'false');
  viewerAvailable = viewer.protocol === 'https:';
  // Never save or log live viewer/CDP links. GUI playback is a separate acceptance test.
  console.log(JSON.stringify({ event: 'session_ready', viewerUrlReceived: viewerAvailable }));
  const cdp = new URL('wss://connect.steel.dev');
  cdp.searchParams.set('apiKey', key);
  cdp.searchParams.set('sessionId', session.id);
  browser = await chromium.connectOverCDP(cdp.href, { timeout: 25_000 });
  const context = browser.contexts()[0];
  if (!context) throw new Error('Missing default context');
  const page = context.pages()[0] ?? await context.newPage();
  for (const [id, url] of targets) {
    if (interrupted || Date.now() - started > 140_000) break;
    const t = Date.now();
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 18_000 });
      await page.locator('body').waitFor({ timeout: 5_000 });
      // Bound hydration waiting; no networkidle wait on third-party analytics.
      await page.waitForFunction(() => (document.body?.innerText.trim().length ?? 0) > 150, { }, { timeout: 5_000 }).catch(() => {});
      const title = await page.title();
      const body = await page.locator('body').innerText({ timeout: 5_000 });
      const status = response?.status() ?? null;
      const blocked = status === 403 || status === 429 || /verifying you are human|verify you are human|just a moment|access denied|pardon our interruption/i.test(title + '\n' + body.slice(0,1500));
      const auth = status === 401 || /weblogin|login.microsoftonline/.test(page.url());
      const root = page.locator('main, [role="main"]').first();
      const text = await root.count() ? await root.innerText({ timeout: 5_000 }) : body;
      const result = {
        id, requestedUrl: url, url: page.url(), title, status,
        outcome: blocked ? 'ACCESS_BLOCKED' : auth ? 'AUTH_REQUIRED' : (status && status >= 400) ? 'NAVIGATION_FAILED' : text.trim().length < 100 ? 'NO_MATCH' : 'READABLE',
        fetchedAt: new Date().toISOString(), characters: text.length, elapsedMs: Date.now()-t,
      };
      results.push(result);
      // Short public excerpts only. This probe is not evidence-module input.
      await writeFile(new URL(`${id}.json`, out), JSON.stringify({ ...result, excerpt: result.outcome === 'READABLE' ? text.slice(0,700) : '' }, null, 2), { mode: 0o600 });
      console.log(JSON.stringify(result));
    } catch (error) {
      const code = interrupted ? 'CANCELLED' : error instanceof Error && error.name === 'TimeoutError' ? 'TIMEOUT' : 'NAVIGATION_FAILED';
      const result = { id, requestedUrl: url, outcome: code, elapsedMs: Date.now()-t };
      results.push(result); console.log(JSON.stringify(result));
    }
  }
} catch (error) {
  // SDK and Playwright errors can contain credential-bearing connection URLs.
  console.error(JSON.stringify({ event: 'smoke_failed', code: interrupted ? 'CANCELLED' : 'SESSION_OR_CONNECTION_FAILED', detail: error instanceof Error ? error.message.split(key).join('[REDACTED]').replace(/https?:\/\/\S+|wss?:\/\/\S+/g, '[URL]').slice(0, 800) : 'Unknown', status: typeof error === 'object' && error !== null && 'status' in error ? error.status : null }));
  process.exitCode = 1;
} finally {
  // Remote release must be attempted even if CDP connect/close failed.
  if (creationAttempted && createdSessionId) {
    cleanup = 'release_failed';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await client.sessions.release(createdSessionId, {}, { timeout: 10_000, maxRetries: 0 });
        const state = await client.sessions.retrieve(createdSessionId, { timeout: 10_000, maxRetries: 0 });
        if (state.status === 'released') { cleanup = 'released'; break; }
      } catch { /* bounded retry; no raw errors */ }
    }
  }
  const close = browser?.close().catch(() => {});
  if (close) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([close, new Promise<void>(resolve => { timer = setTimeout(resolve, 3_000); })]);
    if (timer) clearTimeout(timer);
  }
  const summary = { startedAt: new Date(started).toISOString(), sessionCreated, viewerUrlReceived: viewerAvailable, viewerPlaybackVerified: false, cleanup, elapsedMs: Date.now()-started, results };
  await writeFile(new URL(eventsMode ? 'events-summary.json' : 'summary.json', out), JSON.stringify(summary, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ event: 'smoke_complete', cleanup, elapsedMs: summary.elapsedMs }));
  if (cleanup === 'release_failed' || interrupted || results.slice(0,2).filter(r=>r.outcome === 'READABLE').length !== 2) process.exitCode = 1;
  process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
}
