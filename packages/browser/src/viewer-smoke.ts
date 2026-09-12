import { stat, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Steel from 'steel-sdk';
import { chromium, type Browser } from 'playwright';

const steelAPIKey = process.env.STEEL_API_KEY;
if (!steelAPIKey) throw new Error('STEEL_API_KEY is required.');

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const output = new URL('../artifacts/', import.meta.url);
const screenshotUrl = new URL('viewer.png', output);
const screenshotPath = fileURLToPath(screenshotUrl);
await mkdir(output, { recursive: true, mode: 0o700 });

const client = new Steel({ steelAPIKey, maxRetries: 0, timeout: 25_000 });
let sessionId: string | null = null;
let remoteBrowser: Browser | undefined;
let localBrowser: Browser | undefined;
let cleanup = 'not_created';

try {
  const session = await client.sessions.create({
    timeout: 120_000,
    debugConfig: { interactive: false, systemCursor: false },
  });
  sessionId = session.id;

  const cdpUrl = new URL('wss://connect.steel.dev');
  cdpUrl.searchParams.set('apiKey', steelAPIKey);
  cdpUrl.searchParams.set('sessionId', session.id);
  remoteBrowser = await chromium.connectOverCDP(cdpUrl.href, { timeout: 25_000 });
  const remoteContext = remoteBrowser.contexts()[0];
  if (!remoteContext) throw new Error('Missing Steel default browser context.');
  const remotePage = remoteContext.pages()[0] ?? (await remoteContext.newPage());
  await remotePage.goto('https://artsci.calendar.utoronto.ca/course/csc207h1', {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  await remotePage.getByText('CSC207H1', { exact: false }).first().waitFor({ timeout: 10_000 });

  const viewerUrl = new URL(session.debugUrl);
  viewerUrl.searchParams.set('interactive', 'false');
  localBrowser = await chromium.launch({ executablePath: chromePath, headless: true });
  const viewerPage = await localBrowser.newPage({ viewport: { width: 1440, height: 900 } });
  const response = await viewerPage.goto(viewerUrl.href, {
    waitUntil: 'domcontentloaded',
    timeout: 25_000,
  });
  await viewerPage.waitForTimeout(8_000);
  await viewerPage.screenshot({ path: screenshotPath, fullPage: false });

  const surfaceCounts = await viewerPage.locator('canvas, video, iframe').count();
  const bodyText = (await viewerPage.locator('body').innerText()).replace(/\s+/g, ' ').trim();
  const screenshotBytes = (await stat(screenshotPath)).size;
  const assertions = {
    viewerHttpOk: response?.ok() === true,
    titlePresent: (await viewerPage.title()).trim().length > 0,
    viewerSurfacePresent: surfaceCounts > 0,
    screenshotWritten: screenshotBytes > 10_000,
  };
  console.log(JSON.stringify({
    type: 'viewer_checked',
    status: response?.status() ?? null,
    title: await viewerPage.title(),
    surfaceCounts,
    bodyCharacters: bodyText.length,
    screenshotBytes,
    assertions,
  }));
  if (!Object.values(assertions).every(Boolean)) process.exitCode = 1;
} finally {
  await localBrowser?.close().catch(() => undefined);
  await remoteBrowser?.close().catch(() => undefined);
  if (sessionId) {
    try {
      await client.sessions.release(sessionId, {}, { timeout: 10_000, maxRetries: 0 });
      const session = await client.sessions.retrieve(sessionId, { timeout: 10_000, maxRetries: 0 });
      cleanup = session.status === 'released' ? 'released' : 'release_failed';
    } catch {
      cleanup = 'release_failed';
    }
  }
  console.log(JSON.stringify({ type: 'viewer_cleanup', cleanup }));
  if (cleanup !== 'released') process.exitCode = 1;
}
