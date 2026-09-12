import type { PageSnapshot, QueryPlan } from "@allabout/contracts";

import type { CandidateExtractor, ExtractedCandidate } from "./types.js";

const DATE = /[A-Za-z]+\s+\d{1,2},\s*\d{4}/;

function sentences(text: string): string[] {
  return text.match(/[^.!?]+[.!?]?/g)?.map((item) => item.trim()).filter(Boolean) ?? [];
}

export class RuleBasedExtractor implements CandidateExtractor {
  async extract(
    plan: QueryPlan,
    snapshots: PageSnapshot[],
    signal: AbortSignal,
  ): Promise<ExtractedCandidate[]> {
    const results: ExtractedCandidate[] = [];

    for (const snapshot of snapshots) {
      signal.throwIfAborted();
      const authority = snapshot.kind === "official" ? "institution" : "unknown";
      const authorityBasis = snapshot.kind === "official"
        ? "Source is registered as official"
        : null;

      for (const sentence of sentences(snapshot.text)) {
        if (plan.requestedFields.includes("deadline") &&
            /(?:registration|submission|application|project)/i.test(sentence) &&
            /(?:closes?|deadline|due)/i.test(sentence)) {
          const dateRaw = sentence.match(DATE)?.[0];
          if (dateRaw) {
            results.push({
              snapshotId: snapshot.id,
              field: "deadline",
              text: `The deadline is ${dateRaw}.`,
              quote: sentence,
              nature: "fact",
              authority,
              authorityBasis,
              dateRaw,
            });
          }
        }

        if (plan.requestedFields.includes("submission_format") &&
            /(?:submit|submission|upload)/i.test(sentence) &&
            /\b(?:PDF|DOCX?|ZIP|PPTX?)\b/i.test(sentence)) {
          results.push({
            snapshotId: snapshot.id,
            field: "submission_format",
            text: sentence,
            quote: sentence,
            nature: "fact",
            authority,
            authorityBasis,
          });
        }
      }
    }

    return results;
  }
}
