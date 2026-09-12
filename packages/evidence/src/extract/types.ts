import type { Authority, PageSnapshot, QueryPlan } from "@allabout/contracts";

export type ExtractedCandidate = {
  snapshotId: string;
  field: string;
  text: string;
  quote: string;
  nature: "fact" | "opinion";
  authority: Authority;
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
