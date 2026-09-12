import type { Authority, PageSnapshot, QueryPlan } from "@allabout/contracts";
import type { CandidateExtractor, ExtractedCandidate } from "./types.js";

const DATE = /(?:\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2}))?|[A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:AM|PM)?\s*(?:[A-Z]{2,5}|[A-Za-z_]+\/[A-Za-z_]+)?)?)/i;
const TIME = /\b\d{1,2}(?::\d{2})\s*(?:AM|PM)?(?:\s*(?:EST|EDT|UTC|GMT|[A-Za-z_]+\/[A-Za-z_]+))?\b/i;
const URL = /https?:\/\/[^\s<>"']+/i;

export type AuthorityRegistry = Record<string, { authority: Authority; basis: string }>;

function segments(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split(/\n+/)
    .flatMap((line) => line.match(/.*?(?:[.!?](?=\s|$)|$)/g) ?? [])
    .map((item) => item.trim())
    .filter(Boolean);
}

function requested(plan: QueryPlan, ...fields: string[]): boolean {
  return fields.some((field) => plan.requestedFields.includes(field));
}

function candidate(
  snapshot: PageSnapshot,
  field: string,
  text: string,
  quote: string,
  authority: Authority,
  authorityBasis: string | null,
  extra: Partial<ExtractedCandidate> = {},
): ExtractedCandidate {
  return { snapshotId: snapshot.id, field, text, quote, nature: "fact", authority, authorityBasis, ...extra };
}

function trimUrl(value: string): string {
  return value.replace(/[),.;!?]+$/g, "");
}

export class RuleBasedExtractor implements CandidateExtractor {
  constructor(private readonly registry: AuthorityRegistry = {}) {}

  async extract(
    plan: QueryPlan,
    snapshots: PageSnapshot[],
    signal: AbortSignal,
  ): Promise<ExtractedCandidate[]> {
    const results: ExtractedCandidate[] = [];

    for (const snapshot of snapshots) {
      signal.throwIfAborted();
      const registered = this.registry[snapshot.sourceId];
      const authority: Authority = registered?.authority ?? (snapshot.kind === "official" ? "institution" : "unknown");
      const authorityBasis = registered?.basis ?? (snapshot.kind === "official" ? "Source is registered as official" : null);
      const titleQuote = snapshot.title.trim();
      if (requested(plan, "event_name") && titleQuote && snapshot.text.includes(titleQuote)) {
        results.push(candidate(snapshot, "event_name", titleQuote, titleQuote, authority, authorityBasis, { dedupeValue: titleQuote }));
      }

      for (const sentence of segments(snapshot.text)) {
        const url = sentence.match(URL)?.[0];
        if (requested(plan, "registration_link") && url && /(?:register|registration|sign[ -]?up|tickets?|RSVP|报名)/i.test(sentence)) {
          const cleanUrl = trimUrl(url);
          results.push(candidate(snapshot, "registration_link", cleanUrl, sentence, authority, authorityBasis, { dedupeValue: cleanUrl }));
        }

        const isDeadline = /(?:registration|application|submission|RSVP|tickets?)/i.test(sentence) && /(?:closes?|deadline|due|by)\b/i.test(sentence);
        if (requested(plan, "deadline") && isDeadline) {
          const dateRaw = sentence.match(DATE)?.[0];
          if (dateRaw) results.push(candidate(snapshot, "deadline", sentence, sentence, authority, authorityBasis, { dateRaw, dedupeValue: dateRaw }));
        }

        if (requested(plan, "event_date", "date") && !isDeadline && /(?:\bdate\s*:|\bwhen\s*:|\bevent\b|meeting|workshop|orientation|talk|lecture|hackathon|club)/i.test(sentence)) {
          const dateRaw = sentence.match(DATE)?.[0];
          if (dateRaw) results.push(candidate(snapshot, "event_date", sentence, sentence, authority, authorityBasis, { dateRaw, dedupeValue: dateRaw }));
        }

        if (requested(plan, "event_time", "time") && /(?:\btime\s*:|\bwhen\s*:|\bdate\s*:|event|meeting|workshop)/i.test(sentence)) {
          const time = sentence.match(TIME)?.[0];
          if (time) results.push(candidate(snapshot, "event_time", time, sentence, authority, authorityBasis, { dedupeValue: time }));
        }

        if (requested(plan, "location", "campus") && /(?:location|venue|room|building|online|zoom|campus|where\s*:)/i.test(sentence)) {
          results.push(candidate(snapshot, "location", sentence, sentence, authority, authorityBasis));
        }

        if (requested(plan, "organizer") && /(?:organized|hosted|organizer|presented)\s+by/i.test(sentence)) {
          results.push(candidate(snapshot, "organizer", sentence, sentence, authority, authorityBasis));
        }

        if (requested(plan, "event_description") && /(?:event|meeting|workshop|orientation|talk|lecture|hackathon|club)/i.test(sentence)) {
          results.push(candidate(snapshot, "event_description", sentence, sentence, authority, authorityBasis));
        }

        if (requested(plan, "submission_format") && /(?:submit|submission|upload)/i.test(sentence) && /\b(?:PDF|DOCX?|ZIP|PPTX?)\b/i.test(sentence)) {
          results.push(candidate(snapshot, "submission_format", sentence, sentence, authority, authorityBasis));
        }

        if (requested(plan, "requirements", "prerequisite") && /(?:\bprerequisite(?:s)?\s*:|\brequirements?\s*:|\bmust (?:have|be|bring|complete)|\brequired to\b)/i.test(sentence)) {
          results.push(candidate(snapshot, "requirements", sentence, sentence, authority, authorityBasis));
        }

        if (requested(plan, "eligibility") && /(?:eligib(?:le|ility)|open to|available to|for (?:all )?students|members only)/i.test(sentence)) {
          results.push(candidate(snapshot, "eligibility", sentence, sentence, authority, authorityBasis));
        }

        if (snapshot.kind === "course_discussion" && /(?:\bI\b|\bwe\b|students? (?:say|said|recommend|usually)|in my experience)/i.test(sentence)) {
          results.push({ ...candidate(snapshot, "community_note", sentence, sentence, registered?.authority ?? "unknown", registered?.basis ?? null), nature: "opinion" });
        }
      }
    }

    return results;
  }
}
