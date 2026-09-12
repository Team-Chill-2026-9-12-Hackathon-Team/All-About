import { collectPages, type BrowserSignal, type QueryPlan, type Scope } from './index.js';

const scope: Scope = {
  school: 'University of Toronto', campus: 'St. George', term: 'Fall 2026',
  course: null, section: null, entity: 'timeout test',
};
const plan: QueryPlan = {
  runId: `timeout-smoke-${Date.now()}`,
  input: { query: 'force a bounded timeout', scope, mode: 'LIVE_WEB' },
  targets: [{
    id: 'uoft-events', kind: 'official', label: 'University of Toronto events listing',
    entryUrl: 'https://www.utoronto.ca/events', allowedHosts: ['www.utoronto.ca'],
    scope, contentMode: 'live', access: 'public',
  }],
  requestedFields: ['date'],
  budget: { maxPages: 1, maxSteps: 2, timeoutMs: 1_000 },
};

const observed: string[] = [];
const batch = await collectPages(plan, (event: BrowserSignal) => {
  observed.push(event.type);
  console.log(JSON.stringify(
    event.type === 'session_ready' ? { type: event.type, viewerUrlReceived: true } : event,
  ));
}, new AbortController().signal);
const assertions = {
  noPages: batch.pages.length === 0,
  timedOut: batch.failures.length === 1 && batch.failures[0]?.code === 'TIMEOUT',
  released: batch.cleanup === 'released',
  emittedFailure: observed.includes('source_failed'),
};
console.log(JSON.stringify({ type: 'timeout_complete', cleanup: batch.cleanup, assertions }));
if (!Object.values(assertions).every(Boolean)) process.exitCode = 1;
