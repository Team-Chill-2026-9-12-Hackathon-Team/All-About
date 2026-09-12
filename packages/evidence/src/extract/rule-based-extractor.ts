import type { PageSnapshot, QueryPlan } from "@allabout/contracts";

import type { CandidateExtractor, ExtractedCandidate } from "./types.js";

const DATE = /(?:[A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?|\d{4}-\d{2}-\d{2})/;

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
        // Common fields produced by club/event crawlers. Each claim keeps the
        // original sentence so the evidence engine can verify its citation.
        if (plan.requestedFields.includes("event_date") &&
            /(?:event|meeting|workshop|orientation|talk|lecture|hackathon|club)/i.test(sentence) &&
            /(?:on|at|date|when)\b/i.test(sentence)) {
          const dateRaw = sentence.match(DATE)?.[0];
          if (dateRaw) results.push({ snapshotId: snapshot.id, field: "event_date", text: sentence, quote: sentence, nature: "fact", authority, authorityBasis, dateRaw });
        }

        if (plan.requestedFields.includes("location") &&
            /(?:location|venue|room|building|online|zoom|campus)/i.test(sentence)) {
          results.push({ snapshotId: snapshot.id, field: "location", text: sentence, quote: sentence, nature: "fact", authority, authorityBasis });
        }

        if (plan.requestedFields.includes("registration_link") &&
            /(?:register|registration|sign[ -]?up|报名)/i.test(sentence) &&
            /https?:\/\/\S+/i.test(sentence)) {
          results.push({ snapshotId: snapshot.id, field: "registration_link", text: sentence, quote: sentence, nature: "fact", authority, authorityBasis });
        }

        if (plan.requestedFields.includes("organizer") &&
            /(?:organized|hosted|organizer|presented)\s+by/i.test(sentence)) {
          results.push({ snapshotId: snapshot.id, field: "organizer", text: sentence, quote: sentence, nature: "fact", authority, authorityBasis });
        }

        if (plan.requestedFields.includes("event_description") &&
            /(?:event|meeting|workshop|orientation|talk|lecture|hackathon|club)/i.test(sentence)) {
          results.push({ snapshotId: snapshot.id, field: "event_description", text: sentence, quote: sentence, nature: "fact", authority, authorityBasis });
        }

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

        if ((plan.requestedFields.includes("requirements") || plan.requestedFields.includes("prerequisite")) &&
            /(?:requirement|prerequisite|must have|required|required to|eligib(?:le|ility))/i.test(sentence)) {
          results.push({
            snapshotId: snapshot.id,
            field: "requirements",
            text: sentence,
            quote: sentence,
            nature: "fact",
            authority,
            authorityBasis,
          });
        }

        if (plan.requestedFields.includes("eligibility") &&
            /(?:eligib(?:le|ility)|open to|available to|for students)/i.test(sentence)) {
          results.push({
            snapshotId: snapshot.id,
            field: "eligibility",
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
