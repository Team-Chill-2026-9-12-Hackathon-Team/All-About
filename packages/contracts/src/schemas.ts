import { z } from "zod";

const identifierSchema = z.string().trim().min(1);
const nullableContextSchema = z.string().trim().min(1).nullable();
const isoTimestampSchema = z.string().datetime({ offset: true });

export const SchemaVersionSchema = z.literal("1");
export const SourceKindSchema = z.enum([
  "official",
  "course_discussion",
  "community",
]);
export const RunModeSchema = z.enum([
  "LIVE_WEB",
  "LIVE_FIXTURE",
  "LOCAL_FIXTURE",
  "REPLAY",
]);
export const ExecutionKindSchema = z.enum([
  "steel_live_web",
  "steel_live_fixture",
  "local_fixture",
  "replay",
]);
export const ViewerStateSchema = z.enum([
  "unavailable",
  "ready",
  "closed",
  "cleanup_failed",
]);
export const ContentModeSchema = z.enum([
  "live",
  "cached",
  "fixture",
  "user_provided",
]);
export const AuthoritySchema = z.enum([
  "institution",
  "instructor",
  "ta",
  "student",
  "unknown",
]);

export const ScopeSchema = z.strictObject({
  school: nullableContextSchema,
  campus: nullableContextSchema,
  term: nullableContextSchema,
  course: nullableContextSchema,
  section: nullableContextSchema,
  entity: nullableContextSchema,
});

export const QueryInputSchema = z.strictObject({
  query: z.string().trim().min(1),
  scope: ScopeSchema,
  sourceIds: z.array(identifierSchema).min(1).optional(),
  mode: RunModeSchema,
  parentRunId: identifierSchema.optional(),
});

export const SourceConfigSchema = z.strictObject({
  id: identifierSchema,
  kind: SourceKindSchema,
  label: z.string().trim().min(1),
  entryUrl: z.string().url(),
  allowedHosts: z.array(z.string().trim().min(1)).min(1),
  scope: ScopeSchema,
  contentMode: ContentModeSchema,
  access: z.enum(["public", "authorized", "unconfigured"]),
});

export const QueryPlanSchema = z.strictObject({
  runId: identifierSchema,
  input: QueryInputSchema,
  targets: z.array(SourceConfigSchema),
  requestedFields: z.array(identifierSchema).min(1),
  budget: z.strictObject({
    maxPages: z.number().int().positive(),
    maxSteps: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
  }),
});

export const PageSnapshotSchema = z.strictObject({
  id: identifierSchema,
  sourceId: identifierSchema,
  url: z.string().url(),
  title: z.string().trim().min(1),
  text: z.string(),
  fetchedAt: isoTimestampSchema,
  publishedAt: isoTimestampSchema.nullable(),
  updatedAt: isoTimestampSchema.nullable(),
  scope: ScopeSchema,
  kind: SourceKindSchema,
  contentMode: ContentModeSchema,
  screenshotRef: z.string().trim().min(1).optional(),
});

export const FailureCodeSchema = z.enum([
  "AUTH_REQUIRED",
  "ACCESS_BLOCKED",
  "TIMEOUT",
  "NO_MATCH",
  "UNSUPPORTED_SOURCE",
  "NAVIGATION_FAILED",
  "MODEL_FAILED",
  "CANCELLED",
]);

export const SourceFailureSchema = z.strictObject({
  sourceId: identifierSchema,
  code: FailureCodeSchema,
  message: z.string().trim().min(1),
  retryable: z.boolean(),
});

export const BrowserSignalSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("session_ready"),
    viewerUrl: z.string().url(),
  }),
  z.strictObject({
    type: z.literal("step"),
    sourceId: identifierSchema,
    action: z.string().trim().min(1),
    url: z.string().url().optional(),
  }),
  z.strictObject({
    type: z.literal("page_read"),
    snapshot: PageSnapshotSchema,
  }),
  z.strictObject({
    type: z.literal("source_failed"),
    failure: SourceFailureSchema,
  }),
]);

export const BrowserBatchSchema = z.strictObject({
  pages: z.array(PageSnapshotSchema),
  failures: z.array(SourceFailureSchema),
  cleanup: z.enum(["released", "not_created", "release_failed"]),
});

export const CleanupStateSchema = BrowserBatchSchema.shape.cleanup;

export const DateValueSchema = z.discriminatedUnion("precision", [
  z.strictObject({
    precision: z.literal("instant"),
    iso: isoTimestampSchema,
    timezone: z.string().trim().min(1),
  }),
  z.strictObject({
    precision: z.literal("date"),
    date: z.iso.date(),
    timezone: z.string().trim().min(1).nullable(),
  }),
  z.strictObject({
    precision: z.literal("unknown"),
    raw: z.string().trim().min(1),
  }),
]);

export const EvidenceSchema = z.strictObject({
  id: identifierSchema,
  snapshotId: identifierSchema,
  quote: z.string().trim().min(1),
  locator: z.string().trim().min(1).optional(),
  authority: AuthoritySchema,
  authorityBasis: z.string().trim().min(1).nullable(),
});

export const ClaimSchema = z.strictObject({
  id: identifierSchema,
  field: identifierSchema,
  text: z.string().trim().min(1),
  scope: ScopeSchema,
  nature: z.enum(["fact", "opinion"]),
  status: z.enum(["supported", "conflict", "unknown", "superseded"]),
  evidenceIds: z.array(identifierSchema),
  dateValue: DateValueSchema.optional(),
});

export const ConflictSchema = z.strictObject({
  id: identifierSchema,
  claimIds: z.array(identifierSchema).min(2),
  field: identifierSchema,
  resolution: z.enum(["explicit_update", "unresolved"]),
  selectedClaimId: identifierSchema.nullable(),
  explanation: z.string().trim().min(1),
  evidenceIds: z.array(identifierSchema).min(1),
});

export const KeyDateSchema = z.strictObject({
  id: identifierSchema,
  label: z.string().trim().min(1),
  value: DateValueSchema,
  claimId: identifierSchema,
  evidenceIds: z.array(identifierSchema).min(1),
  status: z.enum(["confirmed", "needs_confirmation"]),
});

export const CoverageSchema = z.strictObject({
  sourceId: identifierSchema,
  status: z.enum(["checked", "partial", "blocked", "not_checked"]),
  reason: z.string().trim().min(1).nullable(),
  snapshotIds: z.array(identifierSchema),
});

export const AnswerBlockSchema = z.strictObject({
  text: z.string().trim().min(1),
  claimIds: z.array(identifierSchema),
  evidenceIds: z.array(identifierSchema),
});

export const PublicSourceSchema = PageSnapshotSchema.omit({ text: true });

export const AnswerBundleSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  runId: identifierSchema,
  mode: RunModeSchema,
  scope: ScopeSchema,
  summary: z.array(AnswerBlockSchema),
  requirements: z.array(AnswerBlockSchema),
  communityNotes: z.array(AnswerBlockSchema),
  unknowns: z.array(z.string().trim().min(1)),
  claims: z.array(ClaimSchema),
  evidence: z.array(EvidenceSchema),
  conflicts: z.array(ConflictSchema),
  keyDates: z.array(KeyDateSchema),
  coverage: z.array(CoverageSchema),
  sources: z.array(PublicSourceSchema),
  generatedAt: isoTimestampSchema,
});

export const RunStatusSchema = z.enum([
  "queued",
  "planning",
  "needs_input",
  "browsing",
  "synthesizing",
  "completed",
  "partial",
  "failed",
  "cancelling",
  "cancelled",
]);

export const SourceSummarySchema = SourceConfigSchema.pick({
  id: true,
  label: true,
  kind: true,
  access: true,
});

export const SourcesResponseSchema = z.array(SourceSummarySchema);

export const CreateRunResponseSchema = z.strictObject({
  runId: identifierSchema,
  eventsUrl: z.string().startsWith("/api/runs/"),
  status: z.literal("queued"),
});

export const RunSnapshotSchema = z.strictObject({
  runId: identifierSchema,
  mode: RunModeSchema,
  executionKind: ExecutionKindSchema,
  status: RunStatusSchema,
  answer: AnswerBundleSchema.nullable(),
  lastSeq: z.number().int().nonnegative(),
  cleanup: CleanupStateSchema.nullable(),
  viewerUrl: z.string().url().nullable(),
  viewerState: ViewerStateSchema,
  clarification: z.strictObject({
    question: z.string().trim().min(1),
    missingFields: z.array(identifierSchema).min(1),
  }).nullable(),
});

export const ClarificationRequestSchema = z.strictObject({
  scopePatch: ScopeSchema.partial(),
  answer: z.string().trim().min(1),
});

export const CancelRunResponseSchema = z.strictObject({
  runId: identifierSchema,
  status: RunStatusSchema,
});

export const ApiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().trim().min(1),
    message: z.string().trim().min(1),
  }),
});

const eventBaseShape = {
  schemaVersion: SchemaVersionSchema,
  runId: identifierSchema,
  seq: z.number().int().positive(),
  at: isoTimestampSchema,
};

export const EventEnvelopeSchema = z.discriminatedUnion("type", [
  z.strictObject({
    ...eventBaseShape,
    type: z.literal("run_status"),
    payload: z.strictObject({ status: RunStatusSchema }),
  }),
  z.strictObject({
    ...eventBaseShape,
    type: z.literal("execution_changed"),
    payload: z.strictObject({
      mode: RunModeSchema,
      executionKind: ExecutionKindSchema,
      reason: z.literal("live_fixture_unavailable"),
    }),
  }),
  z.strictObject({
    ...eventBaseShape,
    type: z.literal("clarification_needed"),
    payload: z.strictObject({
      question: z.string().trim().min(1),
      missingFields: z.array(identifierSchema).min(1),
    }),
  }),
  z.strictObject({
    ...eventBaseShape,
    type: z.literal("viewer_ready"),
    payload: z.strictObject({
      viewerUrl: z.string().url(),
      interactive: z.boolean(),
    }),
  }),
  z.strictObject({
    ...eventBaseShape,
    type: z.literal("browser_step"),
    payload: z.strictObject({
      sourceId: identifierSchema,
      action: z.string().trim().min(1),
      url: z.string().url().optional(),
    }),
  }),
  z.strictObject({
    ...eventBaseShape,
    type: z.literal("source_checked"),
    payload: z.strictObject({
      sourceId: identifierSchema,
      snapshotId: identifierSchema,
      title: z.string().trim().min(1),
      url: z.string().url(),
      screenshotRef: z.string().trim().min(1).optional(),
    }),
  }),
  z.strictObject({
    ...eventBaseShape,
    type: z.literal("source_failed"),
    payload: SourceFailureSchema,
  }),
  z.strictObject({
    ...eventBaseShape,
    type: z.literal("answer_ready"),
    payload: AnswerBundleSchema,
  }),
  z.strictObject({
    ...eventBaseShape,
    type: z.literal("viewer_closed"),
    payload: z.strictObject({
      reason: z.enum(["released", "failed", "cancelled", "unavailable"]),
    }),
  }),
  z.strictObject({
    ...eventBaseShape,
    type: z.literal("run_error"),
    payload: z.strictObject({
      code: FailureCodeSchema,
      message: z.string().trim().min(1),
      retryable: z.boolean(),
    }),
  }),
]);
