import { RuleBasedExtractor } from "./extract/rule-based-extractor.ts";
import type { CandidateExtractor } from "./extract/types.ts";
import { resolveConflicts } from "./conflicts/resolve-conflicts.ts";
import { quoteExists } from "./text.ts";
import type { AnswerBundle, BrowserBatch, Claim, Evidence, QueryPlan } from "./types.ts";

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
};

function parseDate(raw: string): Claim["dateValue"] {
  const match = raw.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!match) return { precision: "unknown", raw };
  const month = MONTHS[match[1].toLowerCase()];
  if (!month) return { precision: "unknown", raw };
  return {
    precision: "date",
    date: `${match[3]}-${month}-${match[2].padStart(2, "0")}`,
    timezone: null,
  };
}

export function createEvidenceEngine(extractor: CandidateExtractor) {
  return async function buildAnswer(
    plan: QueryPlan,
    batch: BrowserBatch,
    signal: AbortSignal,
  ): Promise<AnswerBundle> {
    signal.throwIfAborted();
    const snapshots = new Map(batch.pages.map((page) => [page.id, page]));
    const candidates = await extractor.extract(plan, batch.pages, signal);
    signal.throwIfAborted();

    const claims: Claim[] = [];
    const evidence: Evidence[] = [];
    for (const candidate of candidates) {
      const snapshot = snapshots.get(candidate.snapshotId);
      if (!snapshot || !quoteExists(candidate.quote, snapshot.text)) continue;

      const evidenceItem: Evidence = {
        id: `evidence-${evidence.length + 1}`,
        snapshotId: snapshot.id,
        quote: candidate.quote,
        authority: candidate.authority,
        authorityBasis: candidate.authorityBasis,
      };
      claims.push({
        id: `claim-${claims.length + 1}`,
        field: candidate.field,
        text: candidate.text,
        scope: snapshot.scope,
        nature: candidate.nature,
        status: "supported",
        evidenceIds: [evidenceItem.id],
        ...(candidate.dateRaw ? { dateValue: parseDate(candidate.dateRaw) } : {}),
      });
      evidence.push(evidenceItem);
    }

    const failures = new Map(batch.failures.map((item) => [item.sourceId, item]));
    const coverage = plan.targets.map((target) => {
      const pages = batch.pages.filter((page) => page.sourceId === target.id);
      const failure = failures.get(target.id);
      return {
        sourceId: target.id,
        status: pages.length > 0 ? "checked" as const : failure ? "blocked" as const : "not_checked" as const,
        reason: failure?.message ?? null,
        snapshotIds: pages.map((page) => page.id),
      };
    });

    const resolved = resolveConflicts(claims, evidence, batch.pages);
    return {
      schemaVersion: "1",
      runId: plan.runId,
      summary: resolved.claims
        .filter((claim) => claim.status === "supported")
        .map((claim) => ({
        text: claim.text,
        claimIds: [claim.id],
        evidenceIds: claim.evidenceIds,
      })),
      unknowns: resolved.claims.length === 0
        ? ["No supported facts were found in the checked pages."]
        : resolved.conflicts.some((item) => item.resolution === "unresolved")
          ? ["Conflicting values require confirmation from an authoritative source."]
          : [],
      claims: resolved.claims,
      evidence,
      conflicts: resolved.conflicts,
      keyDates: resolved.keyDates,
      coverage,
      generatedAt: new Date().toISOString(),
    };
  };
}

export const buildAnswer = createEvidenceEngine(new RuleBasedExtractor());
