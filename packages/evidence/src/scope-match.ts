import type { PageSnapshot, QueryPlan } from "@allabout/contracts";

const COURSE_TOKEN = /\b([a-z]{3})\s?-?\s?(\d{3})(h1|y1)?\b/i;

export function normalizeCourse(value: string | null | undefined): string | null {
  const match = value?.match(COURSE_TOKEN);
  if (!match?.[1] || !match[2]) return null;
  return `${match[1].toUpperCase()}${match[2]}${(match[3] ?? "").toUpperCase()}`;
}

export function sameCourse(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  const compact = (value: string) => value.replace(/h1|y1/i, "");
  return left === right || compact(left) === compact(right);
}

export function askedCourse(plan: QueryPlan): string | null {
  return normalizeCourse(plan.input.scope.course) ?? normalizeCourse(plan.input.query);
}

export function snapshotCourse(snapshot: PageSnapshot): string | null {
  return (
    normalizeCourse(snapshot.scope.course) ??
    normalizeCourse(snapshot.url) ??
    normalizeCourse(snapshot.title)
  );
}

export function isOffTopicOfficial(snapshot: PageSnapshot, course: string | null): boolean {
  if (!course || snapshot.kind !== "official") return false;
  const pageCourse = snapshotCourse(snapshot);
  if (!pageCourse) return false;
  return !sameCourse(pageCourse, course);
}

export function isJunkSentence(sentence: string): boolean {
  const text = sentence.replace(/\s+/g, " ").trim();
  return (
    text.length < 16 ||
    /visible link|skip to main content|cookie|privacy policy/i.test(text) ||
    /^https?:\/\//i.test(text) ||
    /^ca\//i.test(text)
  );
}
