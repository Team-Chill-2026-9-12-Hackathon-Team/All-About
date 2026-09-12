import type { z } from "zod";

import type {
  AnswerBlockSchema,
  AnswerBundleSchema,
  AuthoritySchema,
  BrowserBatchSchema,
  BrowserSignalSchema,
  ClaimSchema,
  ConflictSchema,
  ContentModeSchema,
  CoverageSchema,
  DateValueSchema,
  EventEnvelopeSchema,
  EvidenceSchema,
  FailureCodeSchema,
  KeyDateSchema,
  PageSnapshotSchema,
  PublicSourceSchema,
  ClarificationRequestSchema,
  ClarificationResponseSchema,
  CreateRunResponseSchema,
  QueryInputSchema,
  QueryPlanSchema,
  RunSnapshotSchema,
  RunModeSchema,
  RunStatusSchema,
  ScopeSchema,
  SourceConfigSchema,
  SourceFailureSchema,
  SourceKindSchema,
  SourceSummarySchema,
  SseEventIdSchema,
} from "./schemas.js";

export type Scope = z.infer<typeof ScopeSchema>;
export type QueryInput = z.infer<typeof QueryInputSchema>;
export type SourceConfig = z.infer<typeof SourceConfigSchema>;
export type QueryPlan = z.infer<typeof QueryPlanSchema>;
export type PageSnapshot = z.infer<typeof PageSnapshotSchema>;
export type SourceFailure = z.infer<typeof SourceFailureSchema>;
export type BrowserSignal = z.infer<typeof BrowserSignalSchema>;
export type BrowserBatch = z.infer<typeof BrowserBatchSchema>;
export type DateValue = z.infer<typeof DateValueSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Claim = z.infer<typeof ClaimSchema>;
export type Conflict = z.infer<typeof ConflictSchema>;
export type KeyDate = z.infer<typeof KeyDateSchema>;
export type Coverage = z.infer<typeof CoverageSchema>;
export type AnswerBlock = z.infer<typeof AnswerBlockSchema>;
export type PublicSource = z.infer<typeof PublicSourceSchema>;
export type AnswerBundle = z.infer<typeof AnswerBundleSchema>;
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
export type SourceSummary = z.infer<typeof SourceSummarySchema>;
export type RunSnapshot = z.infer<typeof RunSnapshotSchema>;
export type CreateRunResponse = z.infer<typeof CreateRunResponseSchema>;
export type ClarificationRequest = z.infer<typeof ClarificationRequestSchema>;
export type ClarificationResponse = z.infer<typeof ClarificationResponseSchema>;
export type SseEventId = z.infer<typeof SseEventIdSchema>;
export type SourceKind = z.infer<typeof SourceKindSchema>;
export type RunMode = z.infer<typeof RunModeSchema>;
export type ContentMode = z.infer<typeof ContentModeSchema>;
export type Authority = z.infer<typeof AuthoritySchema>;
export type FailureCode = z.infer<typeof FailureCodeSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;

export type BrowserEmitter = (signal: BrowserSignal) => void;
export type CollectPages = (
  plan: QueryPlan,
  emit: BrowserEmitter,
  signal: AbortSignal,
) => Promise<BrowserBatch>;
export type BuildAnswer = (
  plan: QueryPlan,
  batch: BrowserBatch,
  signal: AbortSignal,
) => Promise<AnswerBundle>;
