import type { PageSnapshot, SourceConfig } from "@allabout/contracts";

export const demo101Scope = {
  school: "University of Toronto",
  campus: "UTSG",
  term: "Fall 2026",
  course: "DEMO101",
  section: null,
  entity: "Assignment 2",
} as const;

export const demo101Sources = [
  {
    id: "demo101-syllabus",
    kind: "official",
    label: "DEMO101 syllabus",
    entryUrl: "https://gist.githubusercontent.com/Jesse-Zeng423/51c8f84bf6a9c41595cafcaf6bb04145/raw/demo101-syllabus.txt",
    allowedHosts: ["gist.githubusercontent.com"],
    scope: demo101Scope,
    contentMode: "fixture",
    access: "public",
  },
  {
    id: "demo101-announcement",
    kind: "official",
    label: "DEMO101 instructor announcement",
    entryUrl: "https://gist.githubusercontent.com/Jesse-Zeng423/51c8f84bf6a9c41595cafcaf6bb04145/raw/demo101-announcement.txt",
    allowedHosts: ["gist.githubusercontent.com"],
    scope: demo101Scope,
    contentMode: "fixture",
    access: "public",
  },
  {
    id: "demo101-student-discussion",
    kind: "course_discussion",
    label: "DEMO101 student discussion",
    entryUrl: "https://gist.githubusercontent.com/Jesse-Zeng423/51c8f84bf6a9c41595cafcaf6bb04145/raw/demo101-discussion.txt",
    allowedHosts: ["gist.githubusercontent.com"],
    scope: demo101Scope,
    contentMode: "fixture",
    access: "public",
  },
] as const satisfies SourceConfig[];

const pages: Record<string, Omit<PageSnapshot, "id" | "fetchedAt">> = {
  "demo101-syllabus": {
    sourceId: "demo101-syllabus",
    url: "https://fixture.example.edu/demo101/syllabus",
    title: "DEMO101 syllabus — fictional demo",
    text: "Demo data · Fictional course. The assignment is due September 18, 2026 at 5:00 PM EDT. Submit one PDF.",
    publishedAt: "2026-09-01T09:00:00-04:00",
    updatedAt: null,
    scope: demo101Scope,
    kind: "official",
    contentMode: "fixture",
  },
  "demo101-announcement": {
    sourceId: "demo101-announcement",
    url: "https://fixture.example.edu/demo101/announcement",
    title: "DEMO101 instructor announcement — fictional demo",
    text: "Demo data · Fictional course. Instructor announcement: the assignment is extended and now due September 20, 2026 at 5:00 PM EDT. Submit one PDF. All other submission requirements remain unchanged.",
    publishedAt: "2026-09-12T10:00:00-04:00",
    updatedAt: null,
    scope: demo101Scope,
    kind: "official",
    contentMode: "fixture",
  },
  "demo101-student-discussion": {
    sourceId: "demo101-student-discussion",
    url: "https://fixture.example.edu/demo101/discussion",
    title: "DEMO101 student discussion — fictional demo",
    text: "Last year's DEMO101 assignment felt easy. I remember the assignment was due on a Friday.",
    publishedAt: "2026-09-11T18:00:00-04:00",
    updatedAt: null,
    scope: demo101Scope,
    kind: "course_discussion",
    contentMode: "fixture",
  },
};

export function demo101Snapshot(sourceId: string, runId: string, fetchedAt: string): PageSnapshot | null {
  const page = pages[sourceId];
  if (!page) return null;
  return {
    ...page,
    id: `${runId}:${sourceId}`,
    fetchedAt,
  };
}
