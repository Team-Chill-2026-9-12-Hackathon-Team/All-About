export { buildAnswer, createEvidenceEngine } from "./build-answer.js";
export { RuleBasedExtractor } from "./extract/rule-based-extractor.js";
export { resolveConflicts } from "./conflicts/resolve-conflicts.js";
export type { CandidateExtractor, ExtractedCandidate } from "./extract/types.js";
export { normalizeText, quoteExists } from "./text.js";
export type {
  AnswerBundle,
  BrowserBatch,
  Claim,
  Evidence,
  PageSnapshot,
  QueryPlan,
  Scope,
} from "@allabout/contracts";
