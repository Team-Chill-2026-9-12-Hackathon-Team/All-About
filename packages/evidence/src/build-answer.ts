import { resolveConflicts } from "./conflicts/resolve-conflicts.js";
import { parseDateValue } from "./dates.js";
import { RuleBasedExtractor } from "./extract/rule-based-extractor.js";
import type { CandidateExtractor } from "./extract/types.js";
import { normalizeText, quoteExists } from "./text.js";
import type { AnswerBlock, AnswerBundle, BrowserBatch, Claim, Evidence, QueryPlan } from "@allabout/contracts";

const SUMMARY_FIELDS = new Set([
  "deadline", "eligibility", "event_date", "event_description", "event_name",
  "event_time", "location", "organizer", "registration_link",
  "syllabus", "answer",
]);
const REQUIREMENT_FIELDS = new Set(["requirements", "submission_format"]);
const FIELD_ALIASES: Record<string, string> = {
  campus: "location",
  date: "event_date",
  prerequisite: "requirements",
  time: "event_time",
};

function canonicalField(field: string): string {
  return FIELD_ALIASES[field] ?? field;
}

function scopeIdentity(claimScope: Claim["scope"], snapshotId: string): string {
  const stable = JSON.stringify(claimScope);
  return claimScope.entity ? stable : `${stable}:${snapshotId}`;
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
      if (!snapshot || !candidate.quote.trim() || !quoteExists(candidate.quote, snapshot.text)) continue;

      const evidenceItem: Evidence = {
        id: `evidence-${evidence.length + 1}`,
        snapshotId: snapshot.id,
        quote: candidate.quote,
        authority: candidate.authority,
        authorityBasis: candidate.authorityBasis,
      };
      evidence.push(evidenceItem);
      const dateValue = candidate.dateRaw ? parseDateValue(candidate.dateRaw) : undefined;
      const value = normalizeText(candidate.dedupeValue ?? candidate.text).toLowerCase();
      const key = JSON.stringify([
        candidate.field,
        scopeIdentity(snapshot.scope, snapshot.id),
        dateValue ?? value,
      ]);
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

    const failuresBySource = new Map<string, string[]>();
    for (const failure of batch.failures) {
      failuresBySource.set(failure.sourceId, [...(failuresBySource.get(failure.sourceId) ?? []), failure.message]);
    }
    const coverage = plan.targets.map((target) => {
      const pages = batch.pages.filter((page) => page.sourceId === target.id);
      const failureMessages = failuresBySource.get(target.id) ?? [];
      return {
        sourceId: target.id,
        status: pages.length && failureMessages.length ? "partial" as const
          : pages.length ? "checked" as const
            : failureMessages.length ? "blocked" as const : "not_checked" as const,
        reason: failureMessages.length ? failureMessages.join("; ") : null,
        snapshotIds: pages.map((page) => page.id),
      };
    });

    const resolved = resolveConflicts(claims, evidence, batch.pages);
    const block = (claim: Claim): AnswerBlock => ({ text: claim.text, claimIds: [claim.id], evidenceIds: claim.evidenceIds });
    const supported = resolved.claims.filter((claim) => claim.status === "supported");
    const summary = supported.filter((claim) => SUMMARY_FIELDS.has(claim.field)).map(block);
    const requirements = supported.filter((claim) => REQUIREMENT_FIELDS.has(claim.field)).map(block);
    const communityNotes = supported.filter((claim) => claim.nature === "opinion" || claim.field === "community_note").map(block);

    const unknowns: string[] = [];
    const presentFields = new Set(resolved.claims.filter((claim) => claim.status !== "superseded").map((claim) => claim.field));
    for (const requestedField of new Set(plan.requestedFields.map(canonicalField))) {
      if (!presentFields.has(requestedField)) {
        const entity = plan.input.scope.entity ? ` for ${plan.input.scope.entity}` : "";
        unknowns.push(`The checked sources did not provide ${requestedField.replaceAll("_", " ")}${entity}.`);
      }
    }
    for (const conflict of resolved.conflicts.filter((item) => item.resolution === "unresolved")) {
      unknowns.push(`Conflicting ${conflict.field} values require confirmation from an authoritative source.`);
    }
    for (const claim of resolved.claims) {
      if (claim.dateValue?.precision === "unknown") {
        unknowns.push(`The date or time in claim ${claim.id} could not be normalized without inventing missing context: ${claim.dateValue.raw}`);
      }
    }
    for (const item of coverage.filter((entry) => entry.status !== "checked")) {
      unknowns.push(`Source ${item.sourceId} was ${item.status}${item.reason ? `: ${item.reason}` : "."}`);
    }

    const seenSources = new Set<string>();
    const sources = batch.pages
      .filter((page) => !seenSources.has(page.id) && seenSources.add(page.id))
      .map(({ text: _text, ...source }) => source);

    return {
      schemaVersion: "1",
      runId: plan.runId,
      mode: plan.input.mode,
      scope: plan.input.scope,
      summary,
      requirements,
      communityNotes,
      unknowns: [...new Set(unknowns)],
      claims: resolved.claims,
      evidence,
      conflicts: resolved.conflicts,
      keyDates: resolved.keyDates,
      coverage,
      sources,
      generatedAt: new Date().toISOString(),
    };
  };
}

export const buildAnswer = createEvidenceEngine(new RuleBasedExtractor());
