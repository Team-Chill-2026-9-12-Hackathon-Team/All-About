import type { PageSnapshot, QueryPlan } from "@allabout/contracts";

import { askedCourse, isJunkSentence, isOffTopicOfficial } from "../scope-match.js";
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
    const course = askedCourse(plan);
    const requested = new Set(plan.requestedFields);

    for (const snapshot of snapshots) {
      signal.throwIfAborted();
      if (isOffTopicOfficial(snapshot, course)) continue;

      const discussion = snapshot.kind === "course_discussion" || /reddit\.com|piazza\.com/i.test(snapshot.url);
      const authority = snapshot.kind === "official" ? "institution" : discussion ? "student" : snapshot.kind === "community" ? "student" : "unknown";
      const authorityBasis = snapshot.kind === "official"
        ? "Source is registered as official"
        : discussion
          ? "Source is registered as student discussion"
          : null;

      for (const sentence of sentences(snapshot.text)) {
        if (isJunkSentence(sentence)) continue;
        if (course && discussion && !new RegExp(course.replace(/h1|y1/i, ""), "i").test(sentence) && !/assignment|a2|due|deadline|piazza|reddit/i.test(sentence)) {
          continue;
        }

        if (discussion) {
          results.push({
            snapshotId: snapshot.id,
            field: "community_note",
            text: sentence,
            quote: sentence,
            nature: "opinion",
            authority,
            authorityBasis,
          });
          continue;
        }

        if (requested.has("event_date") &&
            /(?:event|meeting|workshop|orientation|talk|lecture|hackathon|club)/i.test(sentence) &&
            /(?:on|at|date|when)\b/i.test(sentence)) {
          const dateRaw = sentence.match(DATE)?.[0];
          if (dateRaw) results.push({ snapshotId: snapshot.id, field: "event_date", text: sentence, quote: sentence, nature: "fact", authority, authorityBasis, dateRaw });
        }

        if (requested.has("location") &&
            /(?:location|venue|room|building|online|zoom|campus)/i.test(sentence)) {
          results.push({ snapshotId: snapshot.id, field: "location", text: sentence, quote: sentence, nature: "fact", authority, authorityBasis });
        }

        if (requested.has("registration_link") &&
            /(?:register|registration|sign[ -]?up|报名)/i.test(sentence) &&
            /https?:\/\/\S+/i.test(sentence)) {
          results.push({ snapshotId: snapshot.id, field: "registration_link", text: sentence, quote: sentence, nature: "fact", authority, authorityBasis });
        }

        if (requested.has("organizer") &&
            /(?:organized|hosted|organizer|presented)\s+by/i.test(sentence)) {
          results.push({ snapshotId: snapshot.id, field: "organizer", text: sentence, quote: sentence, nature: "fact", authority, authorityBasis });
        }

        if (requested.has("event_description") &&
            /(?:event|meeting|workshop|orientation|talk|lecture|hackathon|club)/i.test(sentence)) {
          results.push({ snapshotId: snapshot.id, field: "event_description", text: sentence, quote: sentence, nature: "fact", authority, authorityBasis });
        }

        if (requested.has("deadline") &&
            /(?:registration|submission|application|project|assignment)/i.test(sentence) &&
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

        if (requested.has("submission_format") &&
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

        if ((requested.has("requirements") || requested.has("prerequisite")) &&
            /(?:prerequisite|exclusion|must have completed|degree requirements)/i.test(sentence)) {
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

        if (requested.has("eligibility") &&
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
