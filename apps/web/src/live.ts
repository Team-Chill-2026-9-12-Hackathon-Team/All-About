import { useCallback, useEffect, useRef, useState } from 'react';
import { detectActivities, detectSearch, type Institution } from './search-architecture.ts';

export { classifyQuestion, detectSearch } from './search-architecture.ts';

// ---- Shared contract shapes (structural mirror of @allabout/contracts) ----

export type RunMode = 'LIVE_WEB' | 'LIVE_FIXTURE' | 'LOCAL_FIXTURE' | 'REPLAY';

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

export interface AnswerClaim {
  id: string;
  field: string;
  text: string;
  status: string;
  evidenceIds: string[];
}

export interface AnswerConflict {
  id: string;
  claimIds: string[];
  field: string;
  resolution: string;
  selectedClaimId: string | null;
  explanation: string;
  evidenceIds: string[];
}

export interface CoverageReceipt {
  sourceId: string;
  status: 'checked' | 'partial' | 'blocked' | 'not_checked';
  reason: string | null;
  snapshotIds: string[];
}

export interface AnswerBundle {
  schemaVersion: string;
  runId: string;
  mode: RunMode;
  summary: AnswerBlock[];
  requirements: AnswerBlock[];
  communityNotes: AnswerBlock[];
  unknowns: string[];
  claims: AnswerClaim[];
  evidence: Evidence[];
  conflicts: AnswerConflict[];
  keyDates: KeyDate[];
  coverage: CoverageReceipt[];
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
  executionKind: 'steel_live_web' | 'steel_live_fixture' | 'local_fixture' | 'replay';
  viewerState: 'unavailable' | 'ready' | 'closed' | 'cleanup_failed';
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

export type PresentationState =
  | 'idle'
  | 'local_demo_running'
  | 'live_connecting'
  | 'live_viewer_ready'
  | 'answer_ready'
  | 'partial_answer'
  | 'needs_input'
  | 'failed'
  | 'cancelled';

export function presentationState(run: LiveRun | null): PresentationState {
  if (!run) return 'idle';
  if (run.status === 'needs_input') return 'needs_input';
  if (run.status === 'failed') return 'failed';
  if (run.status === 'cancelled') return 'cancelled';
  if (run.status === 'partial') return 'partial_answer';
  if (run.status === 'completed') return 'answer_ready';
  if (run.executionKind === 'local_fixture') return 'local_demo_running';
  if (run.viewerState === 'ready') return 'live_viewer_ready';
  return 'live_connecting';
}

function executionKind(mode: RunMode): LiveRun['executionKind'] {
  if (mode === 'LIVE_WEB') return 'steel_live_web';
  if (mode === 'LIVE_FIXTURE') return 'steel_live_fixture';
  if (mode === 'LOCAL_FIXTURE') return 'local_fixture';
  return 'replay';
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

export function eventStreamHeaders(runId: string, lastSeq: number): Record<string, string> {
  return {
    accept: 'text/event-stream',
    ...(lastSeq > 0 ? { 'Last-Event-ID': `${runId}:${lastSeq}` } : {}),
  };
}

// ---- Query building (fixed detect → split architecture) ----

const COURSE_RE = /\b([a-z]{3})\s?-?\s?(\d{3})(h1|y1)?\b/i;

export function currentAcademicTerm(now = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 8) return `Fall ${year}`;
  if (month <= 3) return `Winter ${year}`;
  return `Summer ${year}`;
}

export function buildQueryInput(question: string, parentRunId?: string, institution: Institution = 'uoft') {
  const plan = detectSearch(question, institution);
  const fixture = plan.sourceIds.some((id) => id.startsWith('demo101-'));
  return {
    query: question.trim().slice(0, 2000),
    scope: {
      school: institution === 'waterloo' ? 'University of Waterloo' : 'University of Toronto',
      campus: institution === 'waterloo' ? 'Waterloo' : 'UTSG',
      term: fixture ? 'Fall 2026' : currentAcademicTerm(),
      course: plan.course,
      section: null as string | null,
      entity: plan.entity,
    },
    mode: (fixture ? 'LIVE_FIXTURE' : 'LIVE_WEB') as RunMode,
    sourceIds: plan.sourceIds,
    ...(parentRunId ? { parentRunId } : {}),
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
  'demo101-syllabus': {label: 'DEMO101 syllabus', url: 'https://gist.githubusercontent.com/Jesse-Zeng423/51c8f84bf6a9c41595cafcaf6bb04145/raw/demo101-syllabus.txt'},
  'demo101-announcement': {label: 'DEMO101 announcement', url: 'https://gist.githubusercontent.com/Jesse-Zeng423/51c8f84bf6a9c41595cafcaf6bb04145/raw/demo101-announcement.txt'},
  'demo101-student-discussion': {label: 'DEMO101 discussion', url: 'https://gist.githubusercontent.com/Jesse-Zeng423/51c8f84bf6a9c41595cafcaf6bb04145/raw/demo101-discussion.txt'},
  'academic-calendar-csc207': {label: 'CSC207 calendar', url: 'https://artsci.calendar.utoronto.ca/course/csc207h1'},
  'academic-calendar-csc148': {label: 'CSC148 calendar', url: 'https://artsci.calendar.utoronto.ca/course/csc148h1'},
  'cs-undergrad-courses': {label: 'CS department', url: 'https://web.cs.toronto.edu/undergraduate/courses'},
  'academic-calendar-course-search': {label: 'A&S course search', url: 'https://artsci.calendar.utoronto.ca/search-courses'},
  'academic-calendar-cs-specialist': {label: 'CS Specialist calendar', url: 'https://artsci.calendar.utoronto.ca/program/asspe1689'},
  'academic-calendar-degree-requirements': {label: 'Degree requirements', url: 'https://artsci.calendar.utoronto.ca/degree-requirements-hba-hbsc-bcom'},
  'cs-program-entry-cmp1': {label: 'CS program admission', url: 'https://web.cs.toronto.edu/undergraduate/how-to-apply/cmp1'},
  'uoft-current-students': {label: 'Current Students', url: 'https://www.utoronto.ca/current-students'},
  'uoft-registrar': {label: 'University Registrar', url: 'https://www.registrar.utoronto.ca/'},
  'timetable-builder': {label: 'Timetable Builder', url: 'https://ttb.utoronto.ca/'},
  'reddit-uoft-csc207': {label: 'Reddit r/UofT RSS', url: 'https://www.reddit.com/r/UofT/.rss'},
  'reddit-uoft': {label: 'Reddit r/UofT RSS', url: 'https://www.reddit.com/r/UofT/.rss'},
  'piazza-login': {label: 'Piazza', url: 'https://piazza.com/login'},
  'quercus-login': {label: 'Quercus', url: 'https://q.utoronto.ca/'},
  'acorn-login': {label: 'ACORN', url: 'https://www.acorn.utoronto.ca/'},
  'alumni-carillon-recital': {label: 'Alumni events', url: 'https://alumni.utoronto.ca/events/labour-day-carillon-recital-0'},
  'soldiers-tower-features': {label: "Soldiers' Tower", url: 'https://alumni.utoronto.ca/community/soldiers-tower/features-of-soldiers-tower'},
  'uoft-events': {label: 'U of T Events', url: 'https://www.utoronto.ca/events'},
  'student-life-events': {label: 'Student Life', url: 'https://www.studentlife.utoronto.ca/events/'},
  'hart-house-events': {label: 'Hart House', url: 'https://harthouse.ca/events/month'},
  'ulife-organizations': {label: 'ULife', url: 'https://www.ulife.utoronto.ca/organizations'},
  'the-varsity-about': {label: 'The Varsity', url: 'https://thevarsity.ca/about/'},
  'academic-calendar-sessional-dates': {label: 'Sessional dates', url: 'https://artsci.calendar.utoronto.ca/sessional-dates'},
  'artsci-academic-dates': {label: 'A&S academic dates', url: 'https://www.artsci.utoronto.ca/current/dates-deadlines/academic-dates'},
  'artsci-exam-conflicts': {label: 'Exam conflicts', url: 'https://www.artsci.utoronto.ca/current/faculty-registrar/final-exams/exam-conflicts'},
  'ratemyprofessors-uoft': {label: 'Rate My Professors', url: 'https://www.ratemyprofessors.com/'},
  'waterloo-calendar': {label: 'Waterloo Academic Calendar', url: 'https://uwaterloo.ca/academic-calendar/undergraduate-studies/catalog#/home'},
  'waterloo-classes': {label: 'Waterloo Classes', url: 'https://classes.uwaterloo.ca/under.html'},
  'waterloo-events': {label: 'Waterloo Events', url: 'https://uwaterloo.ca/events'},
  'waterloo-important-dates': {label: 'Waterloo Important Dates', url: 'https://uwaterloo.ca/important-dates/undergraduate'},
  'waterloo-registrar': {label: 'Waterloo Registrar', url: 'https://uwaterloo.ca/registrar/'},
  'waterloo-programs': {label: 'Waterloo Programs', url: 'https://uwaterloo.ca/future-students/programs'},
  'waterloo-policies': {label: 'Waterloo Policies', url: 'https://uwaterloo.ca/secretariat/policies-procedures-guidelines'},
  'waterloo-student-life': {label: 'Waterloo Current Students', url: 'https://uwaterloo.ca/students/'},
  'waterloo-recreation-events': {label: 'Waterloo Recreation', url: 'https://warrior.uwaterloo.ca/'},
  'waterloo-housing': {label: 'Waterloo Campus Housing', url: 'https://uwaterloo.ca/campus-housing/'},
  'waterloo-finance': {label: 'Waterloo Student Financial Services', url: 'https://uwaterloo.ca/finance/student-financial-services'},
  'waterloo-coop': {label: 'Waterloo Co-op', url: 'https://uwaterloo.ca/co-operative-education/'},
  'waterloo-career': {label: 'Waterloo Career Development', url: 'https://uwaterloo.ca/career-development/'},
  'waterloo-quest': {label: 'Waterloo Quest', url: 'https://uwaterloo.ca/the-centre/quest'},
  'reddit-waterloo': {label: 'Reddit r/uwaterloo', url: 'https://www.reddit.com/r/uwaterloo/.rss'},
  'uwflow': {label: 'UW Flow', url: 'https://uwflow.com/'},
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
  start: (question: string, options?: { parentRunId?: string }) => Promise<void>;
  cancel: () => Promise<void>;
  clarify: (answer: string) => Promise<void>;
  restore: (item: { id: string; question: string; createdAt: number; mode?: string; status?: string }) => Promise<void>;
  reset: () => void;
}

export function useLiveRun(onSettled?: (run: LiveRun) => void, institution: Institution = 'uoft'): LiveController {
  const [run, setRun] = useState<LiveRun | null>(null);
  const [executionUnavailable, setExecutionUnavailable] = useState(false);
  const [transportError, setTransportError] = useState<string | null>(null);

  const streamAbortRef = useRef<AbortController | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const lastSeqRef = useRef(0);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  const closeStream = useCallback(() => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
  }, []);

  useEffect(() => () => closeStream(), [closeStream]);

  const applyEvent = useCallback((env: EventEnvelope) => {
    setRun((prev) => {
      if (!prev) return prev;
      const accepted = activeIdRef.current === env.runId &&
        (prev.id === env.runId || prev.id === 'detecting');
      if (!accepted) return prev;
      if (env.seq <= prev.lastSeq) return prev;
      lastSeqRef.current = env.seq;

      const next: LiveRun = {
        ...prev,
        id: env.runId,
        lastSeq: Math.max(prev.lastSeq, env.seq),
      };
      const push = (a: Omit<Activity, 'seq'>) => {
        next.activities = [...next.activities, { seq: env.seq, ...a }];
      };

      switch (env.type) {
        case 'execution_changed': {
          next.mode = env.payload.mode as RunMode;
          next.executionKind = env.payload.executionKind as LiveRun['executionKind'];
          next.viewerState = 'unavailable';
          next.viewerUrl = null;
          next.viewerClosed = true;
          next.viewerReason = String(env.payload.reason ?? 'unavailable');
          push({ kind: 'status', title: 'Using clearly labeled local demo data', detail: 'The network fixture was unavailable.' });
          break;
        }
        case 'run_status': {
          const status = env.payload.status as RunStatus;
          next.status = status;
          if (status === 'planning' || status === 'browsing' || status === 'synthesizing') {
            push({ kind: 'status', title: statusLabel(status) });
          }
          if (isTerminal(status)) {
            activeIdRef.current = null;
            closeStream();
            queueMicrotask(() => settledRef.current?.(next));
          }
          break;
        }
        case 'viewer_ready': {
          next.viewerUrl = env.payload.viewerUrl as string;
          next.viewerState = 'ready';
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
            credential_login: 'Signing in with the keychain',
            open_course: 'Opening your enrolled course',
            open_syllabus: 'Opening the course syllabus',
            navigate: next.executionKind === 'local_fixture' ? 'Opening local demo evidence' : 'Opening the browser page',
            read_visible_text: 'Reading visible text',
            hold_for_viewer: 'Holding the live browser so you can see it',
            local_fixture_fallback: 'Network fixture unavailable · using local demo data',
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
          next.viewerState = env.payload.reason === 'failed' ? 'cleanup_failed' : 'closed';
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
    async (id: string): Promise<RunStatus | null> => {
      try {
        const res = await fetch(`/api/runs/${id}`);
        if (!res.ok) return null;
        const snap = (await res.json()) as {
          mode: RunMode;
          executionKind: LiveRun['executionKind'];
          viewerState: LiveRun['viewerState'];
          status: RunStatus;
          answer: AnswerBundle | null;
          cleanup: string | null;
          lastSeq: number;
          viewerUrl?: string | null;
          clarification: LiveRun['clarification'];
        };
        setRun((prev) => {
          if (!prev || prev.id !== id) return prev;
          const next: LiveRun = { ...prev };
          next.mode = snap.mode;
          next.executionKind = snap.executionKind;
          next.viewerState = snap.viewerState;
          next.status = snap.status;
          next.clarification = snap.clarification;
          if (snap.viewerState === 'ready' && snap.viewerUrl) {
            next.viewerUrl = snap.viewerUrl;
            next.viewerClosed = false;
            next.viewerReason = null;
          } else if (snap.viewerState !== 'ready') {
            next.viewerUrl = null;
            next.viewerClosed = snap.viewerState === 'closed' || snap.viewerState === 'cleanup_failed';
            next.viewerReason = snap.cleanup;
          }
          if (snap.answer) {
            next.answer = snap.answer;
            const pages = pagesFromAnswer(snap.answer);
            if (pages.length > 0) {
              const byId = new Map(next.capturedPages.map((page) => [page.sourceId, page]));
              for (const page of pages) {
                if (!byId.has(page.sourceId)) byId.set(page.sourceId, page);
              }
              next.capturedPages = [...byId.values()];
              next.lastPage = preferPrimaryPage(next.capturedPages, next.question) ?? next.lastPage;
            }
            if (next.activities.length === 0) {
              next.activities = activitiesFromAnswer(snap.answer);
            }
          }
          if (snap.status === 'failed' && !next.error) {
            next.error = {
              code: 'FAILED',
              message: 'The run failed before a usable page was captured. Try a course, exam, or event starter.',
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
            if (activeIdRef.current === id) activeIdRef.current = null;
          }
          return next;
        });
        return snap.status;
      } catch {
        /* ignore transient poll errors */
        return null;
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
        const runId = eventsUrl.split('/').at(-2) ?? '';
        let retry = 0;
        while (!abort.signal.aborted && activeIdRef.current === runId) {
          try {
            const cursor = lastSeqRef.current;
            const res = await fetch(eventsUrl, {
              signal: abort.signal,
              headers: eventStreamHeaders(runId, cursor),
            });
            if (!res.ok || !res.body) throw new Error(`Event stream HTTP ${res.status}`);
            retry = 0;
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
            if (abort.signal.aborted) return;
          }
          if (abort.signal.aborted || activeIdRef.current !== runId) return;
          const status = await reconcile(runId);
          if (status && isTerminal(status)) return;
          retry += 1;
          await new Promise((resolve) => setTimeout(resolve, Math.min(250 * 2 ** retry, 2000)));
        }
      })();
    },
    [applyEvent, closeStream, reconcile],
  );

  const start = useCallback(
    async (question: string, options?: { parentRunId?: string }) => {
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
      activeIdRef.current = null;
      lastSeqRef.current = 0;
      setTransportError(null);
      setExecutionUnavailable(false);

      const createdAt = Date.now();
      const trimmed = question.trim().slice(0, 2000);
      const queryInput = buildQueryInput(trimmed, options?.parentRunId, institution);
      const seed = detectActivities(detectSearch(trimmed, institution), SOURCE_LABEL);
      setRun({
        id: 'detecting',
        question: trimmed,
        createdAt,
        mode: queryInput.mode,
        executionKind: executionKind(queryInput.mode),
        viewerState: 'unavailable',
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
          body: JSON.stringify(queryInput),
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
          const payload = await res.json().catch(() => null) as {error?: {message?: string}} | null;
          const message = payload?.error?.message
            ?? (res.status === 500
              ? 'Campus server is unavailable. Restart with npm run dev, then open http://127.0.0.1:5174.'
              : `Server rejected the run (HTTP ${res.status}).`);
          setTransportError(message);
          setRun((prev) => prev ? {...prev, status: 'failed', error: {code: 'RUN_CREATE_FAILED', message}} : prev);
          return;
        }
        const body = (await res.json()) as { runId: string; eventsUrl: string };
        activeIdRef.current = body.runId;
        lastSeqRef.current = 0;
        setRun((prev) => ({
          id: body.runId,
          question: trimmed,
          createdAt,
          mode: queryInput.mode,
          executionKind: executionKind(queryInput.mode),
          viewerState: 'unavailable',
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
    [closeStream, institution, openStream],
  );

  const cancel = useCallback(async () => {
    const id = activeIdRef.current;
    if (!id) return;
    setRun((prev) => (prev ? { ...prev, status: 'cancelling' } : prev));
    try {
      const response = await fetch(`/api/runs/${id}/cancel`, { method: 'POST' });
      if (!response.ok) throw new Error(`Cancel failed (HTTP ${response.status}).`);
      const body = (await response.json()) as { runId: string; status: RunStatus };
      if (body.runId !== id || body.status !== 'cancelled') {
        throw new Error('The backend did not confirm cancellation.');
      }
      let cleanupConfirmed = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const snapshotResponse = await fetch(`/api/runs/${id}`);
        if (!snapshotResponse.ok) break;
        const snapshot = (await snapshotResponse.json()) as {
          viewerState: LiveRun['viewerState'];
          cleanup: string | null;
        };
        if (snapshot.cleanup !== null) {
          cleanupConfirmed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      await reconcile(id);
      if (!cleanupConfirmed) {
        throw new Error('Cancellation was confirmed, but viewer cleanup was not confirmed in time.');
      }
      closeStream();
      activeIdRef.current = null;
    } catch (error) {
      setTransportError(error instanceof Error ? error.message : 'Could not confirm cancellation.');
      await reconcile(id);
    }
  }, [closeStream, reconcile]);

  const clarify = useCallback(async (answer: string) => {
    const id = activeIdRef.current;
    if (!id || !answer.trim()) return;
    setRun((prev) => (prev ? { ...prev, clarification: null } : prev));
    try {
      const response = await fetch(`/api/runs/${id}/clarification`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scopePatch: {}, answer: answer.trim() }),
      });
      if (!response.ok) throw new Error(`Clarification failed (HTTP ${response.status}).`);
      await reconcile(id);
    } catch (err) {
      setTransportError(
        err instanceof Error ? err.message : 'Could not send the clarification.',
      );
      await reconcile(id);
    }
  }, [reconcile]);

  const restore = useCallback(
    async (item: { id: string; question: string; createdAt: number; mode?: string; status?: string }) => {
      closeStream();
      lastSeqRef.current = 0;
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
            executionKind: executionKind((item.mode as RunMode) || 'LIVE_WEB'),
            viewerState: 'unavailable',
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
              message: 'That run is no longer on the server. Ask again to start a new search.',
            },
            clarification: null,
            lastSeq: 0,
          });
          return;
        }
        const snap = (await res.json()) as {
          mode: RunMode;
          executionKind: LiveRun['executionKind'];
          viewerState: LiveRun['viewerState'];
          status: RunStatus;
          answer: AnswerBundle | null;
          lastSeq: number;
          cleanup: string | null;
          clarification: LiveRun['clarification'];
        };
        lastSeqRef.current = snap.lastSeq ?? 0;
        setRun({
          id: item.id,
          question: item.question,
          createdAt: item.createdAt,
          mode: snap.mode,
          executionKind: snap.executionKind,
          viewerState: snap.viewerState,
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
                message: 'The run failed before a usable page was captured. Try a course, exam, or event starter.',
              }
            : null,
          clarification: snap.clarification,
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
    lastSeqRef.current = 0;
    setRun(null);
    setTransportError(null);
    setExecutionUnavailable(false);
  }, [closeStream]);

  // Poll the snapshot while a run is active, so the UI always converges to the
  // terminal state and renders the answer even if the event stream stalls.
  useEffect(() => {
    if (!run || isTerminal(run.status)) return;
    const id = run.id;
    const timer = setInterval(() => void reconcile(id), 1000);
    return () => clearInterval(timer);
  }, [run?.id, run?.status, reconcile]);

  return { run, executionUnavailable, transportError, start, cancel, clarify, restore, reset };
}
