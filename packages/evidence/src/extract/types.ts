import type { PageSnapshot, QueryPlan } from "../types.ts";

export type ExtractedCandidate = {
  snapshotId: string;
  field: string;
  text: string;
  quote: string;
  nature: "fact" | "opinion";
  authority: "institution" | "instructor" | "ta" | "student" | "unknown";
  authorityBasis: string | null;
  dateRaw?: string;
};

export interface CandidateExtractor {
  extract(
    plan: QueryPlan,
    snapshots: PageSnapshot[],
    signal: AbortSignal,
  ): Promise<ExtractedCandidate[]>;
}
