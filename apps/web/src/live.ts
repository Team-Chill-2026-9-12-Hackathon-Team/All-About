import { useCallback, useEffect, useRef, useState } from 'react';
import { detectActivities, detectSearch } from './search-architecture.ts';

export { classifyQuestion, detectSearch } from './search-architecture.ts';

// ---- Shared contract shapes (structural mirror of @allabout/contracts) ----

export type RunMode = 'LIVE_WEB' | 'LIVE_FIXTURE' | 'REPLAY';

export type RunStatus =
  | 'queued'
  | 'planning'
  | 'needs_input'
  | 'browsing'
  | 'synthesizing'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelling'
  | 'cancelled';

export type DateValue =
  | { precision: 'instant'; iso: string; timezone: string }
  | { precision: 'date'; date: string; timezone: string | null }
  | { precision: 'unknown'; raw: string };

export interface AnswerBlock {
  text: string;
  claimIds: string[];
  evidenceIds: string[];
}

export interface Evidence {
  id: string;
  snapshotId: string;
  quote: string;
  locator?: string;
  authority: string;
  authorityBasis: string | null;
}

export interface KeyDate {
  id: string;
  label: string;
  value: DateValue;
  claimId: string;
  evidenceIds: string[];
  status: 'confirmed' | 'needs_confirmation';
}

export interface PublicSource {
  id: string;
  sourceId: string;
  url: string;
  title: string;
  fetchedAt: string;
  publishedAt: string | null;
  updatedAt: string | null;
  kind: string;
  contentMode: string;
}

export interface AnswerBundle {
  schemaVersion: string;
  runId: string;
  mode: RunMode;
  summary: AnswerBlock[];
  requirements: AnswerBlock[];
  communityNotes: AnswerBlock[];
  unknowns: string[];
  claims: unknown[];
  evidence: Evidence[];
  conflicts: unknown[];
  keyDates: KeyDate[];
  coverage: unknown[];
  sources: PublicSource[];
  generatedAt: string;
}

export interface Activity {
  seq: number;
  kind: 'plan' | 'viewer' | 'step' | 'checked' | 'failed' | 'status';
  title: string;
  detail?: string;
  sourceId?: string;
  url?: string;
}

export interface LiveRun {
  id: string;
  question: string;
  createdAt: number;
  mode: RunMode;
  status: RunStatus;
  viewerUrl: string | null;
  viewerClosed: boolean;
  viewerReason: string | null;
  currentUrl: string | null;
  lastPage: { title: string; url: string; sourceId: string } | null;
  capturedPages: { title: string; url: string; sourceId: string }[];
  activities: Activity[];
  answer: AnswerBundle | null;
  error: { code: string; message: string } | null;
  clarification: { question: string; missingFields: string[] } | null;
  lastSeq: number;
}

const TERMINAL: RunStatus[] = ['completed', 'partial', 'failed', 'cancelled'];
export const isTerminal = (s: RunStatus) => TERMINAL.includes(s);

const STATUS_LABEL: Record<RunStatus, string> = {
  queued: 'Detected sites · opening split view',
  planning: 'Detecting which sites to search',
  needs_input: 'Waiting for a detail',
  browsing: 'Gathering the split pages',
  synthesizing: 'Checking the details',
  completed: 'Answer ready',
  partial: 'Partial answer ready',
  failed: 'Could not complete',
  cancelling: 'Stopping',
  cancelled: 'Stopped',
};
export const statusLabel = (s: RunStatus) => STATUS_LABEL[s];

// ---- Query building (fixed detect → split architecture) ----

const COURSE_RE = /\b([a-z]{3})\s?-?\s?(\d{3})(h1|y1)?\b/i;

export function buildQueryInput(question: string) {
  const plan = detectSearch(question);
  return {
    query: question.trim().slice(0, 2000),
    scope: {
      school: 'University of Toronto',
      campus: 'UTSG',
      term: null as string | null,
      course: plan.course,
      section: null as string | null,
      entity: plan.entity,
    },
    mode: 'LIVE_WEB' as RunMode,
    sourceIds: plan.sourceIds,
  };
}

// ---- Event envelope ----

interface EventEnvelope {
  type: string;
  runId: string;
  seq: number;
  at: string;
  payload: Record<string, unknown>;
}

export function hostOf(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).host;
  } catch {
    return undefined;
  }
}

export function preferPrimaryPage<T extends { title: string; url: string; sourceId: string }>(
  pages: T[],
  question = '',
): T | undefined {
  const match = question.match(COURSE_RE);
  const code = match ? `${match[1]}${match[2]}`.toLowerCase() : '';
  if (code) {
    const hit = pages.find((page) => page.url.toLowerCase().includes(code) || page.title.toLowerCase().includes(code));
    if (hit) return hit;
  }
  return pages[0];
}

export const SOURCE_META: Record<string, {label: string; url: string}> = {
  'academic-calendar-csc207': {label: 'CSC207 calendar', url: 'https://artsci.calendar.utoronto.ca/course/csc207h1'},
  'academic-calendar-csc148': {label: 'CSC148 calendar', url: 'https://artsci.calendar.utoronto.ca/course/csc148h1'},
  'cs-undergrad-courses': {label: 'CS department', url: 'https://web.cs.toronto.edu/undergraduate/courses'},
  'timetable-builder': {label: 'Timetable Builder', url: 'https://ttb.utoronto.ca/'},
  'reddit-uoft-csc207': {label: 'Reddit r/UofT', url: 'https://old.reddit.com/r/UofT/'},
  'reddit-uoft': {label: 'Reddit r/UofT', url: 'https://old.reddit.com/r/UofT/'},
  'piazza-login': {label: 'Piazza', url: 'https://piazza.com/login'},
  'quercus-login': {label: 'Quercus', url: 'https://q.utoronto.ca/'},
  'acorn-login': {label: 'ACORN', url: 'https://www.acorn.utoronto.ca/'},
  'alumni-carillon-recital': {label: 'Alumni events', url: 'https://alumni.utoronto.ca/events/labour-day-carillon-recital-0'},
  'uoft-events': {label: 'U of T Events', url: 'https://www.utoronto.ca/events'},
  'student-life-events': {label: 'Student Life', url: 'https://www.studentlife.utoronto.ca/events/'},
  'hart-house-events': {label: 'Hart House', url: 'https://harthouse.ca/events/month'},
  'ulife-organizations': {label: 'ULife', url: 'https://www.ulife.utoronto.ca/organizations'},
  'the-varsity-about': {label: 'The Varsity', url: 'https://thevarsity.ca/about/'},
  'academic-calendar-sessional-dates': {label: 'Sessional dates', url: 'https://artsci.calendar.utoronto.ca/sessional-dates'},
  'artsci-academic-dates': {label: 'A&S academic dates', url: 'https://www.artsci.utoronto.ca/current/dates-deadlines/academic-dates'},
  'artsci-exam-conflicts': {label: 'Exam conflicts', url: 'https://www.artsci.utoronto.ca/current/faculty-registrar/final-exams/exam-conflicts'},
  'ratemyprofessors-uoft': {label: 'Rate My Professors', url: 'https://www.ratemyprofessors.com/'},
};

const SOURCE_LABEL = Object.fromEntries(
  Object.entries(SOURCE_META).map(([id, meta]) => [id, meta.label]),
);

export function pagesFromAnswer(answer: AnswerBundle) {
  return answer.sources.map((source) => ({
    title: source.title,
    url: source.url,
    sourceId: source.sourceId,
  }));
}

export function activitiesFromAnswer(answer: AnswerBundle): Activity[] {
  return answer.sources.map((source, index) => ({
    seq: index + 1,
    kind: 'checked' as const,
    title: `Captured ${SOURCE_LABEL[source.sourceId] ?? source.title}`,
    detail: source.url,
    sourceId: source.sourceId,
    url: source.url,
  }));
}

// ---- Hook ----

export interface LiveController {
  run: LiveRun | null;
  executionUnavailable: boolean;
  transportError: string | null;
  start: (question: string) => Promise<void>;
  cancel: () => Promise<void>;
  clarify: (answer: string) => Promise<void>;
  restore: (item: { id: string; question: string; createdAt: number; mode?: string; status?: string }) => Promise<void>;
  reset: () => void;
}

export function useLiveRun(onSettled?: (run: LiveRun) => void): LiveController {
  const [run, setRun] = useState<LiveRun | null>(null);
  const [executionUnavailable, setExecutionUnavailable] = useState(false);
  const [transportError, setTransportError] = useState<string | null>(null);

  const streamAbortRef = useRef<AbortController | null>(null);
  const seenRef = useRef<Set<number>>(new Set());
  const activeIdRef = useRef<string | null>(null);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  const closeStream = useCallback(() => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
  }, []);

  useEffect(() => () => closeStream(), [closeStream]);

  const applyEvent = useCallback((env: EventEnvelope) => {
    setRun((prev) => {
      if (!prev || prev.id !== env.runId) return prev;
      if (seenRef.current.has(env.seq)) return prev;
      seenRef.current.add(env.seq);

      const next: LiveRun = { ...prev, lastSeq: Math.max(prev.lastSeq, env.seq) };
      const push = (a: Omit<Activity, 'seq'>) => {
        next.activities = [...next.activities, { seq: env.seq, ...a }];
      };

      switch (env.type) {
        case 'run_status': {
          const status = env.payload.status as RunStatus;
          next.status = status;
          if (status === 'planning' || status === 'browsing' || status === 'synthesizing') {
            push({ kind: 'status', title: statusLabel(status) });
          }
          if (isTerminal(status)) {
            closeStream();
            queueMicrotask(() => settledRef.current?.(next));
          }
          break;
        }
        case 'viewer_ready': {
          next.viewerUrl = env.payload.viewerUrl as string;
          next.viewerClosed = false;
          next.viewerReason = null;
          push({ kind: 'viewer', title: 'Live browser connected' });
          break;
        }
        case 'browser_step': {
          const action = String(env.payload.action ?? 'step');
          const url = env.payload.url as string | undefined;
          if (url) next.currentUrl = url;
          const labels: Record<string, string> = {
            detect_sites: 'Detected sites for this question',
            split_panes: 'Opened the split view',
            fallback_source: 'Opened a public fallback',
            sign_in: 'Signing in with the keychain',
            navigate: 'Opening the live page',
            read_visible_text: 'Reading visible text',
            hold_for_viewer: 'Holding the live browser so you can see it',
          };
          push({
            kind: 'step',
            title: labels[action] ?? action.replaceAll('_', ' '),
            detail: url ?? hostOf(url) ?? String(env.payload.sourceId ?? ''),
            sourceId: env.payload.sourceId as string | undefined,
            url,
          });
          break;
        }
        case 'source_checked': {
          const url = env.payload.url as string;
          const captured = {
            title: String(env.payload.title ?? 'page'),
            url,
            sourceId: String(env.payload.sourceId ?? ''),
          };
          next.currentUrl = url;
          next.capturedPages = [...next.capturedPages.filter((page) => page.url !== url), captured];
          next.lastPage = preferPrimaryPage(next.capturedPages, next.question) ?? captured;
          push({
            kind: 'checked',
            title: `Captured ${SOURCE_LABEL[captured.sourceId] ?? captured.title}`,
            detail: url,
            sourceId: captured.sourceId,
            url,
          });
          break;
        }
        case 'source_failed': {
          const sourceId = String(env.payload.sourceId ?? '');
          push({
            kind: 'failed',
            title: `Could not open ${SOURCE_LABEL[sourceId] ?? sourceId}`,
            detail: String(env.payload.message ?? env.payload.code ?? ''),
            sourceId,
          });
          break;
        }
        case 'answer_ready': {
          next.answer = env.payload as unknown as AnswerBundle;
          break;
        }
        case 'viewer_closed': {
          next.viewerClosed = true;
          next.viewerReason = String(env.payload.reason ?? 'released');
          break;
        }
        case 'clarification_needed': {
          next.clarification = {
            question: String(env.payload.question ?? ''),
            missingFields: (env.payload.missingFields as string[]) ?? [],
          };
          break;
        }
        case 'run_error': {
          next.error = {
            code: String(env.payload.code ?? 'ERROR'),
            message: String(env.payload.message ?? 'Run failed.'),
          };
          break;
        }
        default:
          break;
      }
      return next;
    });
  }, [closeStream]);

  // Snapshot reconcile: authoritative backstop when the SSE stream stalls
  // (e.g. a dev proxy buffering the terminal burst of events).
  const reconcile = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/runs/${id}`);
        if (!res.ok) return;
        const snap = (await res.json()) as {
          status: RunStatus;
          answer: AnswerBundle | null;
          cleanup: string | null;
          lastSeq: number;
        };
        setRun((prev) => {
          if (!prev || prev.id !== id) return prev;
          const next: LiveRun = { ...prev };
          next.status = snap.status;
          next.lastSeq = Math.max(next.lastSeq, snap.lastSeq ?? next.lastSeq);
          if (snap.answer && !next.answer) next.answer = snap.answer;
          if (snap.answer && next.activities.length === 0) {
            next.activities = activitiesFromAnswer(snap.answer);
            next.capturedPages = pagesFromAnswer(snap.answer);
            next.lastPage = preferPrimaryPage(next.capturedPages, next.question) ?? next.capturedPages[0] ?? null;
          }
          if (snap.status === 'failed' && !next.error) {
            next.error = {
              code: 'FAILED',
              message: 'The live run failed before a usable page was captured. Try a course, exam, or event starter.',
            };
          }
          if (isTerminal(snap.status)) {
            if (
              snap.cleanup &&
              snap.cleanup !== 'not_created' &&
              next.viewerUrl &&
              !next.viewerClosed
            ) {
              next.viewerClosed = true;
              next.viewerReason = snap.cleanup === 'released' ? 'released' : 'failed';
            }
            queueMicrotask(() => settledRef.current?.(next));
          }
          return next;
        });
      } catch {
        /* ignore transient poll errors */
      }
    },
    [],
  );

  const openStream = useCallback(
    (eventsUrl: string) => {
      closeStream();
      const abort = new AbortController();
      streamAbortRef.current = abort;
      void (async () => {
        try {
          const res = await fetch(eventsUrl, {
            signal: abort.signal,
            headers: { accept: 'text/event-stream' },
          });
          if (!res.body) return;
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (!abort.signal.aborted) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split('\n\n');
            buffer = frames.pop() ?? '';
            for (const frame of frames) {
              const data = frame
                .split('\n')
                .filter((line) => line.startsWith('data: '))
                .map((line) => line.slice(6))
                .join('');
              if (!data) continue;
              try {
                applyEvent(JSON.parse(data) as EventEnvelope);
              } catch {
                /* ignore malformed frame */
              }
            }
          }
        } catch {
          if (!abort.signal.aborted && activeIdRef.current) void reconcile(activeIdRef.current);
        }
      })();
    },
    [applyEvent, closeStream, reconcile],
  );

  const start = useCallback(
    async (question: string) => {
      if (!question.trim()) return;
      const previousId = activeIdRef.current;
      if (previousId) {
        try {
          await fetch(`/api/runs/${previousId}/cancel`, { method: 'POST' });
          await new Promise((resolve) => setTimeout(resolve, 400));
        } catch {
          /* a 409/404 here is fine; we still try the new run */
        }
      }
      closeStream();
      seenRef.current = new Set();
      setTransportError(null);
      setExecutionUnavailable(false);

      const createdAt = Date.now();
      const trimmed = question.trim().slice(0, 2000);
      const seed = detectActivities(detectSearch(trimmed), SOURCE_LABEL);
      setRun({
        id: 'detecting',
        question: trimmed,
        createdAt,
        mode: 'LIVE_WEB',
        status: 'planning',
        viewerUrl: null,
        viewerClosed: false,
        viewerReason: null,
        currentUrl: null,
        lastPage: null,
        capturedPages: [],
        activities: seed,
        answer: null,
        error: null,
        clarification: null,
        lastSeq: 0,
      });
      try {
        const res = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(buildQueryInput(question)),
        });
        if (res.status === 503) {
          setExecutionUnavailable(true);
          setTransportError('Run execution is not configured on the server.');
          return;
        }
        if (res.status === 409) {
          setTransportError('Another run is still active. Stop it before asking again.');
          return;
        }
        if (res.status !== 202) {
          setTransportError(`Server rejected the run (HTTP ${res.status}).`);
          return;
        }
        const body = (await res.json()) as { runId: string; eventsUrl: string };
        activeIdRef.current = body.runId;
        setRun((prev) => ({
          id: body.runId,
          question: trimmed,
          createdAt,
          mode: 'LIVE_WEB',
          status: 'queued',
          viewerUrl: null,
          viewerClosed: false,
          viewerReason: null,
          currentUrl: null,
          lastPage: null,
          capturedPages: [],
          activities: prev?.activities.length ? prev.activities : seed,
          answer: null,
          error: null,
          clarification: null,
          lastSeq: 0,
        }));
        openStream(body.eventsUrl);
      } catch (err) {
        setTransportError(
          err instanceof Error ? err.message : 'Could not reach the backend.',
        );
      }
    },
    [closeStream, openStream],
  );

  const cancel = useCallback(async () => {
    const id = activeIdRef.current;
    if (!id) return;
    setRun((prev) => (prev ? { ...prev, status: 'cancelling' } : prev));
    try {
      await fetch(`/api/runs/${id}/cancel`, { method: 'POST' });
    } catch {
      /* backend will still terminate the run */
    }
  }, []);

  const clarify = useCallback(async (answer: string) => {
    const id = activeIdRef.current;
    if (!id || !answer.trim()) return;
    setRun((prev) => (prev ? { ...prev, clarification: null } : prev));
    try {
      await fetch(`/api/runs/${id}/clarification`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scopePatch: {}, answer: answer.trim() }),
      });
    } catch (err) {
      setTransportError(
        err instanceof Error ? err.message : 'Could not send the clarification.',
      );
    }
  }, []);

  const restore = useCallback(
    async (item: { id: string; question: string; createdAt: number; mode?: string; status?: string }) => {
      closeStream();
      seenRef.current = new Set();
      setTransportError(null);
      setExecutionUnavailable(false);
      activeIdRef.current = item.id;
      try {
        const res = await fetch(`/api/runs/${item.id}`);
        if (!res.ok) {
          activeIdRef.current = null;
          setRun({
            id: item.id,
            question: item.question,
            createdAt: item.createdAt,
            mode: (item.mode as RunMode) || 'LIVE_WEB',
            status: 'completed',
            viewerUrl: null,
            viewerClosed: true,
            viewerReason: 'unavailable',
            currentUrl: null,
            lastPage: null,
            capturedPages: [],
            activities: [],
            answer: null,
            error: {
              code: 'EXPIRED',
              message: 'That live run is no longer on the server. Ask again to search the real page.',
            },
            clarification: null,
            lastSeq: 0,
          });
          return;
        }
        const snap = (await res.json()) as {
          status: RunStatus;
          answer: AnswerBundle | null;
          lastSeq: number;
          cleanup: string | null;
        };
        setRun({
          id: item.id,
          question: item.question,
          createdAt: item.createdAt,
          mode: (item.mode as RunMode) || 'LIVE_WEB',
          status: snap.status,
          viewerUrl: null,
          viewerClosed: isTerminal(snap.status),
          viewerReason: snap.cleanup ?? null,
          currentUrl: preferPrimaryPage(snap.answer ? pagesFromAnswer(snap.answer) : [], item.question)?.url ?? null,
          lastPage: snap.answer ? preferPrimaryPage(pagesFromAnswer(snap.answer), item.question) ?? null : null,
          capturedPages: snap.answer ? pagesFromAnswer(snap.answer) : [],
          activities: snap.answer ? activitiesFromAnswer(snap.answer) : [],
          answer: snap.answer,
          error: snap.status === 'failed' && !snap.answer
            ? {
                code: 'FAILED',
                message: 'The live run failed before a usable page was captured. Try a course, exam, or event starter.',
              }
            : null,
          clarification: null,
          lastSeq: snap.lastSeq ?? 0,
        });
        if (!isTerminal(snap.status)) {
          openStream(`/api/runs/${item.id}/events`);
        } else {
          activeIdRef.current = null;
        }
      } catch (err) {
        setTransportError(err instanceof Error ? err.message : 'Could not restore that run.');
      }
    },
    [closeStream, openStream],
  );

  const reset = useCallback(() => {
    closeStream();
    activeIdRef.current = null;
    seenRef.current = new Set();
    setRun(null);
    setTransportError(null);
    setExecutionUnavailable(false);
  }, [closeStream]);

  // Poll the snapshot while a run is active, so the UI always converges to the
  // terminal state and renders the answer even if the event stream stalls.
  useEffect(() => {
    if (!run || isTerminal(run.status)) return;
    const id = run.id;
    const timer = setInterval(() => void reconcile(id), 2500);
    return () => clearInterval(timer);
  }, [run?.id, run?.status, reconcile]);

  return { run, executionUnavailable, transportError, start, cancel, clarify, restore, reset };
}
