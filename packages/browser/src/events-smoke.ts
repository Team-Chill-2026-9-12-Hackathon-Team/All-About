import { writeFile, mkdir } from 'node:fs/promises';
import { collectPages, type BrowserSignal, type QueryPlan, type Scope } from './index.js';

const scope: Scope = {
  school: 'University of Toronto',
  campus: 'St. George',
  term: 'Fall 2026',
  course: null,
  section: null,
  entity: 'Xplore Hart House 2026',
};

const plan: QueryPlan = {
  runId: `xplore-smoke-${Date.now()}`,
  input: {
    query: 'When and where is Xplore Hart House, and is it listed as a UTSG event?',
    scope,
    sourceIds: ['uoft-events', 'xplore-event'],
    mode: 'LIVE_WEB',
  },
  targets: [
    {
      id: 'uoft-events',
      kind: 'official',
      label: 'University of Toronto events listing',
      entryUrl: 'https://www.utoronto.ca/events',
      allowedHosts: ['www.utoronto.ca'],
      scope,
      contentMode: 'live',
      access: 'public',
    },
    {
      id: 'xplore-event',
      kind: 'official',
      label: 'Xplore Hart House event details',
      entryUrl: 'https://harthouse.ca/events/xplore-hart-house/',
      allowedHosts: ['harthouse.ca'],
      scope,
      contentMode: 'live',
      access: 'public',
    },
  ],
  requestedFields: ['date', 'time', 'location', 'eligibility', 'campus'],
  budget: { maxPages: 2, maxSteps: 6, timeoutMs: 75_000 },
};

const signals: BrowserSignal[] = [];
const started = Date.now();
const batch = await collectPages(plan, (event) => {
  signals.push(event);
  const safeEvent = event.type === 'session_ready' ? { type: event.type, viewerUrlReceived: true } :
    event.type === 'page_read' ? {
      type: event.type,
      sourceId: event.snapshot.sourceId,
      title: event.snapshot.title,
      characters: event.snapshot.text.length,
    } : event;
  console.log(JSON.stringify(safeEvent));
}, new AbortController().signal);

const assertions = {
  twoPages: batch.pages.length === 2,
  noFailures: batch.failures.length === 0,
  released: batch.cleanup === 'released',
  viewerReceived: signals.some((event) => event.type === 'session_ready'),
  listingContextPresent:
    batch.pages[0]?.text.includes('Xplore Hart House') === true &&
    batch.pages[0]?.text.includes('U of T St. George') === true,
  eventDetailsPresent:
    batch.pages[1]?.text.includes('Event Metadata') === true &&
    batch.pages[1]?.text.includes('Hart House') === true,
};

const artifact = {
  runId: plan.runId,
  completedAt: new Date().toISOString(),
  elapsedMs: Date.now() - started,
  cleanup: batch.cleanup,
  failures: batch.failures,
  pages: batch.pages.map((page) => ({
    id: page.id,
    sourceId: page.sourceId,
    url: page.url,
    title: page.title,
    fetchedAt: page.fetchedAt,
    characters: page.text.length,
    publishedAt: page.publishedAt,
    updatedAt: page.updatedAt,
  })),
  assertions,
};

const output = new URL('../artifacts/', import.meta.url);
await mkdir(output, { recursive: true, mode: 0o700 });
await writeFile(new URL('collect-pages-summary.json', output), JSON.stringify(artifact, null, 2), { mode: 0o600 });
await writeFile(
  new URL('collect-pages-batch.json', output),
  JSON.stringify(batch, null, 2),
  { mode: 0o600 },
);
console.log(JSON.stringify({ type: 'complete', ...artifact }));

if (!Object.values(assertions).every(Boolean)) process.exitCode = 1;
