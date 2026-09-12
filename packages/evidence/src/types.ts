// Temporary local copy of the shared contract. Replace these imports with
// @allabout/contracts once B publishes the workspace package.
export type Scope = {
  school: string | null;
  campus: string | null;
  term: string | null;
  course: string | null;
  section: string | null;
  entity: string | null;
};

export type QueryPlan = {
  runId: string;
  requestedFields: string[];
  targets: Array<{ id: string }>;
};

export type PageSnapshot = {
  id: string;
  sourceId: string;
  url: string;
  title: string;
  text: string;
  fetchedAt: string;
  publishedAt: string | null;
  updatedAt: string | null;
  scope: Scope;
  kind: "official" | "course_discussion" | "community";
  contentMode: "live" | "cached" | "fixture" | "user_provided";
};

export type SourceFailure = {
  sourceId: string;
  code: string;
  message: string;
  retryable: boolean;
};

export type BrowserBatch = {
  pages: PageSnapshot[];
  failures: SourceFailure[];
  cleanup: "released" | "not_created" | "release_failed";
};

export type Evidence = {
  id: string;
  snapshotId: string;
  quote: string;
  authority: "institution" | "instructor" | "ta" | "student" | "unknown";
  authorityBasis: string | null;
};

export type Claim = {
  id: string;
  field: string;
  text: string;
  scope: Scope;
  nature: "fact" | "opinion";
  status: "supported" | "conflict" | "unknown" | "superseded";
  evidenceIds: string[];
  dateValue?:
    | { precision: "date"; date: string; timezone: string | null }
    | { precision: "unknown"; raw: string };
};

export type Conflict = {
  id: string;
  claimIds: string[];
  field: string;
  resolution: "explicit_update" | "unresolved";
  selectedClaimId: string | null;
  explanation: string;
  evidenceIds: string[];
};

export type KeyDate = {
  id: string;
  label: string;
  value: NonNullable<Claim["dateValue"]>;
  claimId: string;
  evidenceIds: string[];
  status: "confirmed" | "needs_confirmation";
};

export type AnswerBundle = {
  schemaVersion: "1";
  runId: string;
  summary: Array<{ text: string; claimIds: string[]; evidenceIds: string[] }>;
  unknowns: string[];
  claims: Claim[];
  evidence: Evidence[];
  conflicts: Conflict[];
  keyDates: KeyDate[];
  coverage: Array<{
    sourceId: string;
    status: "checked" | "partial" | "blocked" | "not_checked";
    reason: string | null;
    snapshotIds: string[];
  }>;
  generatedAt: string;
};
