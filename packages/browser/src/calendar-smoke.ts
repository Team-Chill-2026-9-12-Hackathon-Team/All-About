import { mkdir, writeFile } from 'node:fs/promises';
import { collectPages, type BrowserSignal, type QueryPlan, type Scope } from './index.js';

const scope: Scope = {
  school: 'University of Toronto',
  campus: 'St. George',
  term: null,
  course: 'CSC207H1',
  section: null,
  entity: null,
};

const plan: QueryPlan = {
  runId: `calendar-smoke-${Date.now()}`,
  input: {
    query: 'What is CSC207H1 Software Design, and what are its prerequisites?',
    scope,
    sourceIds: ['academic-calendar-csc207', 'academic-calendar-csc148'],
    mode: 'LIVE_WEB',
  },
  targets: [
    {
      id: 'academic-calendar-csc207',
      kind: 'official',
      label: 'A&S Academic Calendar — CSC207H1',
      entryUrl: 'https://artsci.calendar.utoronto.ca/course/csc207h1',
      allowedHosts: ['artsci.calendar.utoronto.ca'],
      scope,
      contentMode: 'live',
      access: 'public',
    },
    {
      id: 'academic-calendar-csc148',
      kind: 'official',
      label: 'A&S Academic Calendar — CSC148H1',
      entryUrl: 'https://artsci.calendar.utoronto.ca/course/csc148h1',
      allowedHosts: ['artsci.calendar.utoronto.ca'],
      scope: { ...scope, course: 'CSC148H1' },
      contentMode: 'live',
      access: 'public',
    },
  ],
  requestedFields: ['deadline', 'eligibility', 'requirements'],
  budget: { maxPages: 2, maxSteps: 6, timeoutMs: 75_000 },
};

const signals: BrowserSignal[] = [];
const started = Date.now();
const batch = await collectPages(plan, (event) => {
  signals.push(event);
  const safeEvent =
    event.type === 'session_ready'
      ? { type: event.type, viewerUrlReceived: true }
      : event.type === 'page_read'
        ? {
            type: event.type,
            sourceId: event.snapshot.sourceId,
            title: event.snapshot.title,
            characters: event.snapshot.text.length,
          }
        : event;
  console.log(JSON.stringify(safeEvent));
}, new AbortController().signal);

const assertions = {
  twoPages: batch.pages.length === 2,
  noFailures: batch.failures.length === 0,
  released: batch.cleanup === 'released',
  viewerReceived: signals.some((event) => event.type === 'session_ready'),
  csc207Present:
    batch.pages[0]?.text.includes('CSC207H1') === true &&
    batch.pages[0]?.text.toLowerCase().includes('software design') === true,
  csc148Present:
    batch.pages[1]?.text.includes('CSC148H1') === true,
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
await writeFile(new URL('calendar-pages-summary.json', output), JSON.stringify(artifact, null, 2), { mode: 0o600 });
await writeFile(
  new URL('calendar-pages-batch.json', output),
  JSON.stringify(batch, null, 2),
  { mode: 0o600 },
);
console.log(JSON.stringify({ type: 'complete', ...artifact }));

if (!Object.values(assertions).every(Boolean)) process.exitCode = 1;
