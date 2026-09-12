export { buildAnswer, createEvidenceEngine } from "./build-answer.ts";
export { RuleBasedExtractor } from "./extract/rule-based-extractor.ts";
export { resolveConflicts } from "./conflicts/resolve-conflicts.ts";
export type { CandidateExtractor, ExtractedCandidate } from "./extract/types.ts";
export { normalizeText, quoteExists } from "./text.ts";
export type * from "./types.ts";
