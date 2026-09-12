import { mkdir, writeFile } from "node:fs/promises";
import type { BrowserBatch, PageSnapshot, QueryPlan, Scope, SourceConfig } from "@allabout/contracts";
import { createEvidenceEngine } from "./build-answer.js";
import { RuleBasedExtractor } from "./extract/rule-based-extractor.js";

const scope: Scope = {
  school: "University of Toronto", campus: "St. George", term: "Fall 2026",
  course: null, section: null, entity: "Demo data · Fictional activity",
};

function source(id: string, kind: SourceConfig["kind"] = "official"): SourceConfig {
  return { id, kind, label: id, entryUrl: `https://example.com/${id}`, allowedHosts: ["example.com"], scope, contentMode: "fixture", access: "public" };
}

function page(id: string, sourceId: string, text: string, kind: PageSnapshot["kind"] = "official"): PageSnapshot {
  return { id, sourceId, url: `https://example.com/${sourceId}`, title: "Demo data · Fictional activity", text, fetchedAt: "2026-09-12T12:00:00-04:00", publishedAt: null, updatedAt: null, scope, kind, contentMode: "fixture" };
}

function plan(runId: string, fields: string[], targets: SourceConfig[]): QueryPlan {
  return { runId, input: { query: "Fixture bundle for UI and integration testing", scope, mode: "LIVE_FIXTURE" }, targets, requestedFields: fields, budget: { maxPages: 4, maxSteps: 8, timeoutMs: 30_000 } };
}

const cases: Array<{ name: string; plan: QueryPlan; batch: BrowserBatch }> = [
  {
    name: "normal-activity",
    plan: plan("sample-normal", ["event_name", "event_date", "location", "registration_link"], [source("demo-event")]),
    batch: { pages: [page("normal", "demo-event", "Demo data · Fictional activity\nDate: September 25, 2026 at 5:00 PM EDT\nLocation: Hart House Great Hall.\nRegister at https://example.com/register?id=123.")], failures: [], cleanup: "released" },
  },
  {
    name: "explicit-extension",
    plan: plan("sample-extension", ["deadline"], [source("demo101-syllabus"), source("demo101-instructor")]),
    batch: { pages: [page("old", "demo101-syllabus", "Registration deadline is September 18, 2026."), page("new", "demo101-instructor", "The registration deadline has been extended to September 20, 2026.")], failures: [], cleanup: "released" },
  },
  {
    name: "unresolved-conflict",
    plan: plan("sample-conflict", ["event_date"], [source("event-list"), source("event-detail")]),
    batch: { pages: [page("list", "event-list", "Event date: September 24, 2026."), page("detail", "event-detail", "Event date: September 25, 2026.")], failures: [], cleanup: "released" },
  },
  {
    name: "missing-eligibility",
    plan: plan("sample-missing", ["requirements", "eligibility"], [source("requirements-page")]),
    batch: { pages: [page("requirements", "requirements-page", "Requirements: Participants must bring a valid TCard.")], failures: [], cleanup: "released" },
  },
];

const engine = createEvidenceEngine(new RuleBasedExtractor({
  "demo101-instructor": { authority: "instructor", basis: "Fixture source registry" },
  "demo101-syllabus": { authority: "institution", basis: "Fixture source registry" },
}));
const outputDirectory = new URL("../../../fixtures/answer-bundles/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });
for (const item of cases) {
  const answer = await engine(item.plan, item.batch, new AbortController().signal);
  await writeFile(new URL(`${item.name}.json`, outputDirectory), `${JSON.stringify(answer, null, 2)}\n`);
}
