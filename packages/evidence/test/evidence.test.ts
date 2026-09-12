import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserBatch, Claim, Evidence, PageSnapshot, QueryPlan, Scope, SourceConfig } from "@allabout/contracts";
import { buildAnswer, createEvidenceEngine, parseDateValue, quoteExists, resolveConflicts } from "../src/index.js";
import type { CandidateExtractor } from "../src/index.js";

const baseScope: Scope = {
  school: "University of Toronto", campus: "St. George", term: "Fall 2026",
  course: null, section: null, entity: "Demo data · Fictional activity",
};

function source(id: string, scope = baseScope): SourceConfig {
  return { id, label: `${id} fixture`, kind: "official", entryUrl: `https://${id}.example.test/event`, allowedHosts: [`${id}.example.test`], scope, contentMode: "fixture", access: "public" };
}

function plan(fields: string[], targets = [source("events")], scope = baseScope): QueryPlan {
  return {
    runId: "evidence-test", input: { query: "Find the event details", scope, mode: "LIVE_FIXTURE" },
    targets, requestedFields: fields, budget: { maxPages: 5, maxSteps: 10, timeoutMs: 90_000 },
  };
}

function page(id: string, sourceId: string, text: string, scope = baseScope, kind: PageSnapshot["kind"] = "official"): PageSnapshot {
  return {
    id, sourceId, url: `https://${sourceId}.example.test/event`, title: "Xplore Hart House",
    text, fetchedAt: "2026-09-12T12:00:00-04:00", publishedAt: null, updatedAt: null,
    scope, kind, contentMode: "fixture",
  };
}

test("quote validation tolerates whitespace but rejects invented text", () => {
  assert.equal(quoteExists("Registration closes tomorrow.", "Registration\n closes   tomorrow."), true);
  assert.equal(quoteExists("Registration opens tomorrow.", "Registration closes tomorrow."), false);
});

test("date parsing preserves offsets and refuses to invent missing context", () => {
  assert.deepEqual(parseDateValue("2026-09-25T17:00:00-04:00"), { precision: "instant", iso: "2026-09-25T17:00:00-04:00", timezone: "-04:00" });
  assert.deepEqual(parseDateValue("September 25, 2026 at 5:00 PM EDT"), { precision: "instant", iso: "2026-09-25T17:00:00-04:00", timezone: "EDT" });
  assert.deepEqual(parseDateValue("September 25 at 5:00 PM"), { precision: "unknown", raw: "September 25 at 5:00 PM" });
});

test("activity fields retain a complete registration URL and citations", async () => {
  const text = [
    "Xplore Hart House",
    "Date: September 25, 2026 at 5:00 PM EDT",
    "Location: Hart House, Great Hall.",
    "Hosted by Hart House.",
    "Register at https://events.example.test/register?id=123.",
    "Requirements: Students must bring a valid TCard.",
    "This event is open to all University of Toronto students.",
  ].join("\n");
  const result = await buildAnswer(plan(["event_name", "event_date", "event_time", "location", "organizer", "registration_link", "requirements", "eligibility"]), {
    pages: [page("event-page", "events", text)], failures: [], cleanup: "released",
  }, new AbortController().signal);

  assert.equal(result.mode, "LIVE_FIXTURE");
  assert.deepEqual(result.scope, baseScope);
  assert.equal(result.claims.find((claim) => claim.field === "registration_link")?.text, "https://events.example.test/register?id=123");
  assert.equal(result.requirements.length, 1);
  assert.equal(result.unknowns.length, 0);
  assert.ok(result.evidence.every((item) => quoteExists(item.quote, text)));
  assert.equal(result.keyDates.find((item) => item.label === "event_date")?.status, "confirmed");
});

test("every requested but absent field is reported", async () => {
  const result = await buildAnswer(plan(["requirements", "eligibility"]), {
    pages: [page("requirements", "events", "Requirements: Students must bring a valid TCard.")], failures: [], cleanup: "released",
  }, new AbortController().signal);
  assert.equal(result.requirements.length, 1);
  assert.deepEqual(result.unknowns, ["The checked sources did not provide eligibility for Demo data · Fictional activity."]);
});

test("duplicate facts merge only when the activity identity is the same", async () => {
  const sameA = { ...baseScope, entity: "Robotics Workshop" };
  const different = { ...baseScope, entity: "Robotics Social" };
  const targets = [source("club-a", sameA), source("club-b", sameA), source("club-c", different)];
  const result = await buildAnswer(plan(["location"], targets, { ...baseScope, entity: null }), {
    pages: [
      page("a", "club-a", "Location: Room 100.", sameA),
      page("b", "club-b", "Location: Room 100.", sameA),
      page("c", "club-c", "Location: Room 100.", different),
    ], failures: [], cleanup: "released",
  }, new AbortController().signal);
  assert.equal(result.claims.length, 2);
  assert.equal(result.claims.find((claim) => claim.scope.entity === "Robotics Workshop")?.evidenceIds.length, 2);
});

test("different activities with different dates are not conflicts", async () => {
  const workshop = { ...baseScope, entity: "Robotics Workshop" };
  const social = { ...baseScope, entity: "Robotics Social" };
  const result = await buildAnswer(plan(["event_date"], [source("workshop", workshop), source("social", social)], { ...baseScope, entity: null }), {
    pages: [
      page("workshop-page", "workshop", "Event date: September 25, 2026.", workshop),
      page("social-page", "social", "Event date: September 26, 2026.", social),
    ], failures: [], cleanup: "released",
  }, new AbortController().signal);
  assert.equal(result.claims.length, 2);
  assert.equal(result.conflicts.length, 0);
});

test("a source with a page and a failure has partial coverage", async () => {
  const result = await buildAnswer(plan(["location"]), {
    pages: [page("partial", "events", "Location: Great Hall.")],
    failures: [{ sourceId: "events", code: "TIMEOUT", message: "Second page timed out", retryable: true }],
    cleanup: "released",
  }, new AbortController().signal);
  assert.equal(result.coverage[0]?.status, "partial");
  assert.ok(result.unknowns.some((item) => item.includes("Source events was partial")));
});

test("candidates with invented quotes are rejected", async () => {
  const extractor: CandidateExtractor = { async extract() { return [{ snapshotId: "p", field: "location", text: "Room 2", quote: "Location: Room 2.", nature: "fact", authority: "institution", authorityBasis: "test" }]; } };
  const result = await createEvidenceEngine(extractor)(plan(["location"]), {
    pages: [page("p", "events", "Location: Room 1.")], failures: [], cleanup: "released",
  }, new AbortController().signal);
  assert.equal(result.claims.length, 0);
  assert.equal(result.evidence.length, 0);
});

function conflictInput(authority: Evidence["authority"], quote: string) {
  const claims: Claim[] = [
    { id: "old", field: "deadline", text: "Old", scope: baseScope, nature: "fact", status: "supported", evidenceIds: ["e-old"], dateValue: { precision: "date", date: "2026-09-18", timezone: null } },
    { id: "new", field: "deadline", text: "New", scope: baseScope, nature: "fact", status: "supported", evidenceIds: ["e-new"], dateValue: { precision: "date", date: "2026-09-20", timezone: null } },
  ];
  const evidence: Evidence[] = [
    { id: "e-old", snapshotId: "old-page", quote: "Due September 18.", authority: "institution", authorityBasis: "syllabus" },
    { id: "e-new", snapshotId: "new-page", quote, authority, authorityBasis: "registry" },
  ];
  return resolveConflicts(claims, evidence, []);
}

test("only an explicit instructor update supersedes an earlier date", () => {
  assert.equal(conflictInput("instructor", "The deadline is extended to September 20.").conflicts[0]?.resolution, "explicit_update");
  assert.equal(conflictInput("institution", "The deadline is extended to September 20.").conflicts[0]?.resolution, "unresolved");
});

test("unknown and non-authoritative dates are never confirmed", () => {
  const claims: Claim[] = [{ id: "date", field: "event_date", text: "September 25", scope: baseScope, nature: "fact", status: "supported", evidenceIds: ["e"], dateValue: { precision: "unknown", raw: "September 25" } }];
  const evidence: Evidence[] = [{ id: "e", snapshotId: "p", quote: "September 25", authority: "student", authorityBasis: null }];
  assert.equal(resolveConflicts(claims, evidence, []).keyDates[0]?.status, "needs_confirmation");
});
