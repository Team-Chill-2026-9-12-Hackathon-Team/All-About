/**
 * Temporary local copy of the frozen v1 browser contract.
 *
 * B has not published packages/contracts yet. Keep the browser implementation
 * dependent on this file so the later migration is a single import change.
 */
export type SourceKind = 'official' | 'course_discussion' | 'community';
export type RunMode = 'LIVE_WEB' | 'LIVE_FIXTURE' | 'REPLAY';
export type ContentMode = 'live' | 'cached' | 'fixture' | 'user_provided';

export interface Scope {
  school: string | null;
  campus: string | null;
  term: string | null;
  course: string | null;
  section: string | null;
  entity: string | null;
}

export interface QueryInput {
  query: string;
  scope: Scope;
  sourceIds?: string[];
  mode: RunMode;
  parentRunId?: string;
}

export interface SourceConfig {
  id: string;
  kind: SourceKind;
  label: string;
  entryUrl: string;
  allowedHosts: string[];
  scope: Scope;
  contentMode: ContentMode;
  access: 'public' | 'authorized' | 'unconfigured';
}

export interface QueryPlan {
  runId: string;
  input: QueryInput;
  targets: SourceConfig[];
  requestedFields: string[];
  budget: { maxPages: number; maxSteps: number; timeoutMs: number };
}

export interface PageSnapshot {
  id: string;
  sourceId: string;
  url: string;
  title: string;
  text: string;
  fetchedAt: string;
  publishedAt: string | null;
  updatedAt: string | null;
  scope: Scope;
  kind: SourceKind;
  contentMode: ContentMode;
  screenshotRef?: string;
}

export type FailureCode =
  | 'AUTH_REQUIRED'
  | 'ACCESS_BLOCKED'
  | 'TIMEOUT'
  | 'NO_MATCH'
  | 'UNSUPPORTED_SOURCE'
  | 'NAVIGATION_FAILED'
  | 'MODEL_FAILED'
  | 'CANCELLED';

export interface SourceFailure {
  sourceId: string;
  code: FailureCode;
  message: string;
  retryable: boolean;
}

export type BrowserSignal =
  | { type: 'session_ready'; viewerUrl: string }
  | { type: 'step'; sourceId: string; action: string; url?: string }
  | { type: 'page_read'; snapshot: PageSnapshot }
  | { type: 'source_failed'; failure: SourceFailure };

export interface BrowserBatch {
  pages: PageSnapshot[];
  failures: SourceFailure[];
  cleanup: 'released' | 'not_created' | 'release_failed';
}
