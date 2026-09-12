import { RuleBasedExtractor } from "./extract/rule-based-extractor.js";
import type { CandidateExtractor } from "./extract/types.js";
import { resolveConflicts } from "./conflicts/resolve-conflicts.js";
import { quoteExists } from "./text.js";
import type { AnswerBlock, AnswerBundle, BrowserBatch, Claim, Evidence, QueryPlan } from "./types.js";

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
};

function parseDate(raw: string): Claim["dateValue"] {
  const instant = raw.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})$/);
  if (instant) return { precision: "instant", iso: new Date(raw).toISOString(), timezone: raw.slice(-6) };
  const match = raw.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!match) return { precision: "unknown", raw };
  const [, monthName, day, year] = match;
  if (monthName === undefined || day === undefined || year === undefined) {
    return { precision: "unknown", raw };
  }
  const month = MONTHS[monthName.toLowerCase()];
  if (!month) return { precision: "unknown", raw };
  return {
    precision: "date",
    date: `${year}-${month}-${day.padStart(2, "0")}`,
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
    const claimByKey = new Map<string, Claim>();
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
      evidence.push(evidenceItem);
      const dateValue = candidate.dateRaw ? parseDate(candidate.dateRaw) : undefined;
      const key = JSON.stringify([candidate.field, candidate.text.trim().replace(/\s+/g, " "), snapshot.scope, dateValue]);
      const existing = claimByKey.get(key);
      if (existing) {
        existing.evidenceIds.push(evidenceItem.id);
        continue;
      }
      const claim: Claim = {
        id: `claim-${claims.length + 1}`,
        field: candidate.field,
        text: candidate.text,
        scope: snapshot.scope,
        nature: candidate.nature,
        status: "supported",
        evidenceIds: [evidenceItem.id],
        ...(dateValue ? { dateValue } : {}),
      };
      claimByKey.set(key, claim);
      claims.push(claim);
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
    const block = (claim: Claim): AnswerBlock => ({ text: claim.text, claimIds: [claim.id], evidenceIds: claim.evidenceIds });
    const supported = resolved.claims.filter((claim) => claim.status === "supported");
    const summary = supported.filter((claim) => ["deadline", "location", "eligibility", "event_date", "organizer", "event_description"].includes(claim.field)).map(block);
    const requirements = supported.filter((claim) => ["submission_format", "requirements"].includes(claim.field)).map(block);
    const communityNotes = supported.filter((claim) => claim.nature === "opinion" || claim.field === "community_note").map(block);
    return {
      schemaVersion: "1",
      runId: plan.runId,
      mode: plan.input?.mode ?? "LIVE_FIXTURE",
      scope: plan.input?.scope ?? supported[0]?.scope ?? batch.pages[0]?.scope ?? {
        school: null, campus: null, term: null, course: null, section: null, entity: null,
      },
      summary,
      requirements,
      communityNotes,
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
      sources: batch.pages.map(({ text: _text, ...source }) => source),
      generatedAt: new Date().toISOString(),
    };
  };
}

export const buildAnswer = createEvidenceEngine(new RuleBasedExtractor());
