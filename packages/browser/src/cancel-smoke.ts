import { collectPages, type BrowserSignal, type QueryPlan, type Scope } from './index.ts';

const scope: Scope = {
  school: 'University of Toronto',
  campus: 'St. George',
  term: 'Fall 2026',
  course: null,
  section: null,
  entity: 'cancellation test',
};
const plan: QueryPlan = {
  runId: `cancel-smoke-${Date.now()}`,
  input: { query: 'cancel this run', scope, mode: 'LIVE_WEB' },
  targets: [{
    id: 'uoft-events',
    kind: 'official',
    label: 'University of Toronto events listing',
    entryUrl: 'https://www.utoronto.ca/events',
    allowedHosts: ['www.utoronto.ca'],
    scope,
    contentMode: 'live',
    access: 'public',
  }],
  requestedFields: ['date'],
  budget: { maxPages: 1, maxSteps: 2, timeoutMs: 60_000 },
};

const controller = new AbortController();
const observed: string[] = [];
const batch = await collectPages(plan, (event: BrowserSignal) => {
  observed.push(event.type);
  if (event.type === 'session_ready') {
    console.log(JSON.stringify({ type: event.type, viewerUrlReceived: true }));
  } else {
    console.log(JSON.stringify(event));
  }
  if (event.type === 'step' && event.action === 'navigate') controller.abort();
}, controller.signal);

const assertions = {
  noPages: batch.pages.length === 0,
  cancelled: batch.failures.length === 1 && batch.failures[0]?.code === 'CANCELLED',
  released: batch.cleanup === 'released',
  emittedFailure: observed.includes('source_failed'),
};
console.log(JSON.stringify({ type: 'cancel_complete', cleanup: batch.cleanup, assertions }));
if (!Object.values(assertions).every(Boolean)) process.exitCode = 1;
