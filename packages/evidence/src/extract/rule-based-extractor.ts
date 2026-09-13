import type { Authority, PageSnapshot, QueryPlan } from "@allabout/contracts";
import type { CandidateExtractor, ExtractedCandidate } from "./types.js";

const DATE = /(?:\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2}))?|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s*\d{4})?(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:AM|PM)?\s*(?:[A-Z]{2,5}|[A-Za-z_]+\/[A-Za-z_]+)?)?)/i;
const TIME = /\b\d{1,2}(?::\d{2})\s*(?:AM|PM)?(?:\s*(?:EST|EDT|UTC|GMT|[A-Za-z_]+\/[A-Za-z_]+))?\b/i;
const URL = /https?:\/\/[^\s<>"']+/i;

export type AuthorityRegistry = Record<string, { authority: Authority; basis: string }>;

const DEFAULT_AUTHORITY_REGISTRY: AuthorityRegistry = {
  "demo101-syllabus": { authority: "institution", basis: "Fixture source registry" },
  "demo101-announcement": { authority: "instructor", basis: "Fixture source registry" },
  "demo101-instructor": { authority: "instructor", basis: "Fixture source registry" },
  "demo101-student-discussion": { authority: "student", basis: "Student discussion fixture" },
};

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

function matchesRequestedAssignment(plan: QueryPlan, sentence: string): boolean {
  const requestedNumber = plan.input.scope.entity?.match(/(?:assignment|a)\s*(\d+)/i)?.[1];
  if (!requestedNumber) return true;
  const mentioned = [...sentence.matchAll(/(?:assignment|a)\s*(\d+)/gi)].map((match) => match[1]);
  return mentioned.length === 0 || mentioned.includes(requestedNumber);
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

function labeledValue(text: string, labels: string[]): { quote: string; value: string } | null {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = text.match(new RegExp(`(?:^|\\n)\\s*(${escaped})\\s*:?\\s*(?:\\n\\s*|[ \\t]+)([^\\n]+)`, "i"));
  if (!match?.[1] || !match[2]) return null;
  const value = match[2].replace(/\s+/g, " ").trim();
  if (!value) return null;
  return { quote: `${match[1].trim()}\n${match[2].trim()}`, value };
}

export class RuleBasedExtractor implements CandidateExtractor {
  constructor(private readonly registry: AuthorityRegistry = DEFAULT_AUTHORITY_REGISTRY) {}

  async extract(
    plan: QueryPlan,
    snapshots: PageSnapshot[],
    signal: AbortSignal,
  ): Promise<ExtractedCandidate[]> {
    const results: ExtractedCandidate[] = [];

    for (const snapshot of snapshots) {
      signal.throwIfAborted();
      let descriptionAdded = false;
      const registered = this.registry[snapshot.sourceId];
      const authority: Authority = registered?.authority ?? (snapshot.kind === "official" ? "institution" : "unknown");
      const authorityBasis = registered?.basis ?? (snapshot.kind === "official" ? "Source is registered as official" : null);
      const communitySource = snapshot.kind === "community";
      const titleQuote = snapshot.title.trim();
      if (requested(plan, "syllabus") && snapshot.sourceId === "quercus-login") {
        const syllabusQuote = snapshot.text.trim().slice(0, 1200);
        if (syllabusQuote.length >= 40) {
          results.push(candidate(
            snapshot,
            "syllabus",
            syllabusQuote,
            syllabusQuote,
            authority,
            authorityBasis,
          ));
        }
      }
      if (requested(plan, "event_name") && titleQuote && snapshot.text.includes(titleQuote)) {
        results.push(candidate(snapshot, "event_name", titleQuote, titleQuote, authority, authorityBasis, { dedupeValue: titleQuote }));
      }

      if (!communitySource && requested(plan, "requirements", "prerequisite")) {
        const prerequisite = labeledValue(snapshot.text, ["Prerequisite", "Prerequisites", "Requirement", "Requirements"]);
        if (prerequisite) {
          results.push(candidate(
            snapshot,
            "requirements",
            `Prerequisite: ${prerequisite.value}`,
            prerequisite.quote,
            authority,
            authorityBasis,
            { dedupeValue: prerequisite.value },
          ));
        }
      }

      for (const sentence of segments(snapshot.text)) {
        if (communitySource && /^\[\d+\]\s+/.test(sentence) && sentence.length > 18) {
          results.push({
            ...candidate(snapshot, "community_note", sentence, sentence, "student", "Public Reddit RSS post title"),
            nature: "opinion",
          });
        }
        const url = sentence.match(URL)?.[0];
        if (requested(plan, "registration_link") && url && /(?:register|registration|sign[ -]?up|tickets?|RSVP|报名)/i.test(sentence)) {
          const cleanUrl = trimUrl(url);
          results.push(candidate(snapshot, "registration_link", cleanUrl, sentence, authority, authorityBasis, { dedupeValue: cleanUrl }));
        }

        const isDeadline =
          /(?:registration|application|submission|RSVP|tickets?|assignment|homework|problem set)/i.test(sentence)
          && /(?:closes?|deadline|due|by|extended)\b/i.test(sentence);
        if (!communitySource && requested(plan, "deadline") && isDeadline && matchesRequestedAssignment(plan, sentence)) {
          const dateRaw = sentence.match(DATE)?.[0];
          if (dateRaw) results.push(candidate(snapshot, "deadline", sentence, sentence, authority, authorityBasis, { dateRaw, dedupeValue: dateRaw }));
        }

        if (!communitySource && requested(plan, "event_date", "date") && !isDeadline && /(?:\bdate\s*:|\bwhen\s*:|\bevent\b|meeting|workshop|orientation|talk|lecture|hackathon|club|recital|carillon)/i.test(sentence)) {
          const dateRaw = sentence.match(DATE)?.[0];
          if (dateRaw) results.push(candidate(snapshot, "event_date", sentence, sentence, authority, authorityBasis, { dateRaw, dedupeValue: dateRaw }));
        }

        if (!communitySource && requested(plan, "event_time", "time") && /(?:\btime\s*:|\bwhen\s*:|\bdate\s*:|event|meeting|workshop)/i.test(sentence)) {
          const time = sentence.match(TIME)?.[0];
          if (time) results.push(candidate(snapshot, "event_time", time, sentence, authority, authorityBasis, { dedupeValue: time }));
        }

        if (!communitySource && requested(plan, "location", "campus") && /(?:location|venue|room|building|online|zoom|campus|where\s*:|\d+\s+[A-Za-z'’.-]+(?:\s+[A-Za-z'’.-]+){0,3}\s+(?:Street|St|Road|Rd|Avenue|Ave|Circle|Lane|Ln)\b)/i.test(sentence)) {
          results.push(candidate(snapshot, "location", sentence, sentence, authority, authorityBasis));
        }

        if (!communitySource && requested(plan, "organizer") && /(?:organized|hosted|organizer|presented)\s+by/i.test(sentence)) {
          results.push(candidate(snapshot, "organizer", sentence, sentence, authority, authorityBasis));
        }

        if (
          !communitySource &&
          requested(plan, "event_description") &&
          !descriptionAdded &&
          sentence.length >= 50 &&
          sentence.length <= 320 &&
          !/(?:questions?|contact|related events|visible link|share this)/i.test(sentence) &&
          /(?:event|meeting|workshop|orientation|talk|lecture|hackathon|club|recital|carillon)/i.test(sentence)
        ) {
          results.push(candidate(snapshot, "event_description", sentence, sentence, authority, authorityBasis));
          descriptionAdded = true;
        }

        if (!communitySource && requested(plan, "submission_format") && /(?:submit|submission|upload)/i.test(sentence) && /\b(?:PDF|DOCX?|ZIP|PPTX?)\b/i.test(sentence)) {
          results.push(candidate(snapshot, "submission_format", sentence, sentence, authority, authorityBasis));
        }

        if (!communitySource && requested(plan, "requirements", "prerequisite") && /(?:\bprerequisite(?:s)?\s*:|\brequirements?\s*:|\bmust (?:have|be|bring|complete)|\brequired to\b)/i.test(sentence)) {
          results.push(candidate(snapshot, "requirements", sentence, sentence, authority, authorityBasis));
        }

        if (!communitySource && requested(plan, "eligibility") && /(?:eligib(?:le|ility)|open to|available to|for (?:all )?students|members only)/i.test(sentence)) {
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
