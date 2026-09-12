import assert from "node:assert/strict";
import test from "node:test";
import type {
  BrowserBatch,
  Claim,
  Evidence,
  PageSnapshot,
  QueryPlan,
  Scope,
  SourceConfig,
} from "@allabout/contracts";

import { buildAnswer, createEvidenceEngine, quoteExists, resolveConflicts } from "../src/index.js";
import type { CandidateExtractor } from "../src/index.js";

const scope: Scope = {
  school: "University of Toronto",
  campus: null,
  term: "Fall 2026",
  course: null,
  section: null,
  entity: "Example event",
};

const source: SourceConfig = {
  id: "official",
  label: "Synthetic official fixture",
  kind: "official",
  entryUrl: "https://example.test",
  allowedHosts: ["example.test"],
  scope,
  contentMode: "fixture",
  access: "public",
};

function makePlan(
  runId: string,
  requestedFields: string[],
  sourceId = source.id,
): QueryPlan {
  return {
    runId,
    input: {
      query: "Synthetic evidence test",
      scope,
      mode: "LIVE_FIXTURE",
    },
    requestedFields,
    targets: [{ ...source, id: sourceId }],
    budget: { maxPages: 3, maxSteps: 6, timeoutMs: 90_000 },
  };
}

test("quote validation tolerates whitespace differences", () => {
  assert.equal(quoteExists("Registration closes tomorrow.", "Registration\n closes   tomorrow."), true);
  assert.equal(quoteExists("Registration opens tomorrow.", "Registration closes tomorrow."), false);
});

test("buildAnswer creates a supported, cited deadline", async () => {
  const plan = makePlan("test-run", ["deadline"]);
  const batch: BrowserBatch = {
    pages: [{
      id: "page-1",
      sourceId: "official",
      url: "https://example.test",
      title: "Example",
      text: "Registration closes on September 20, 2026.",
      fetchedAt: "2026-09-12T12:00:00-04:00",
      publishedAt: null,
      updatedAt: null,
      scope,
      kind: "official",
      contentMode: "fixture",
    }],
    failures: [],
    cleanup: "released",
  };

  const result = await buildAnswer(plan, batch, new AbortController().signal);
  assert.equal(result.claims.length, 1);
  assert.equal(result.evidence.length, 1);
  assert.deepEqual(result.claims[0]!.dateValue, {
    precision: "date",
    date: "2026-09-20",
    timezone: null,
  });
  assert.equal(result.summary[0]!.evidenceIds[0], result.evidence[0]!.id);
});

test("candidates with invented quotes are rejected", async () => {
  const badExtractor: CandidateExtractor = {
    async extract() {
      return [{
        snapshotId: "page-1",
        field: "deadline",
        text: "The deadline is tomorrow.",
        quote: "The deadline is tomorrow.",
        nature: "fact",
        authority: "institution",
        authorityBasis: "test",
      }];
    },
  };
  const engine = createEvidenceEngine(badExtractor);
  const result = await engine(makePlan("bad-quote", ["deadline"]), {
    pages: [{
      id: "page-1",
      sourceId: "official",
      url: "https://example.test",
      title: "Example",
      text: "Registration remains open.",
      fetchedAt: "2026-09-12T12:00:00-04:00",
      publishedAt: null,
      updatedAt: null,
      scope,
      kind: "official",
      contentMode: "fixture",
    }],
    failures: [],
    cleanup: "released",
  }, new AbortController().signal);

  assert.equal(result.claims.length, 0);
  assert.equal(result.evidence.length, 0);
  assert.equal(result.unknowns.length, 1);
});

test("submission formats are extracted when requested", async () => {
  const result = await buildAnswer(makePlan("format-test", ["submission_format"]), {
    pages: [{
      id: "page-format",
      sourceId: "official",
      url: "https://example.test",
      title: "Submission rules",
      text: "Submit the final report as a PDF.",
      fetchedAt: "2026-09-12T12:00:00-04:00",
      publishedAt: null,
      updatedAt: null,
      scope,
      kind: "official",
      contentMode: "fixture",
    }],
    failures: [],
    cleanup: "released",
  }, new AbortController().signal);

  assert.equal(result.claims[0]!.field, "submission_format");
  assert.equal(result.evidence[0]!.quote, "Submit the final report as a PDF.");
});

test("club activity fields are extracted and cited", async () => {
  const result = await buildAnswer(makePlan(
    "club-event",
    ["event_date", "location", "registration_link", "organizer"],
    "clubs",
  ), {
    pages: [{
      id: "club-page",
      sourceId: "clubs",
      url: "https://clubs.example.test/event",
      title: "Robotics Club Workshop",
      text: "Robotics Club workshop on September 25, 2026. Location: Myhal Centre Room 300. Register at https://clubs.example.test/register. Hosted by Robotics Club.",
      fetchedAt: "2026-09-12T12:00:00-04:00",
      publishedAt: null,
      updatedAt: null,
      scope,
      kind: "community",
      contentMode: "fixture",
    }],
    failures: [],
    cleanup: "released",
  }, new AbortController().signal);

  assert.deepEqual(result.claims.map((claim) => claim.field), ["event_date", "location", "registration_link", "organizer"]);
  assert.equal(result.evidence.length, 4);
  assert.equal(result.keyDates[0]!.value.precision, "date");
});

test("identical activity claims are deduplicated while retaining evidence", async () => {
  const result = await buildAnswer(makePlan("dedupe", ["location"], "clubs"), {
    pages: [
      { id: "a", sourceId: "clubs", url: "https://a.test", title: "A", text: "Location: Room 1.", fetchedAt: "2026-09-12T12:00:00-04:00", publishedAt: null, updatedAt: null, scope, kind: "community", contentMode: "fixture" },
      { id: "b", sourceId: "clubs", url: "https://b.test", title: "B", text: "Location: Room 1.", fetchedAt: "2026-09-12T12:01:00-04:00", publishedAt: null, updatedAt: null, scope, kind: "community", contentMode: "fixture" },
    ], failures: [], cleanup: "released",
  }, new AbortController().signal);
  assert.equal(result.claims.length, 1);
  assert.equal(result.claims[0]!.evidenceIds.length, 2);
});

test("requirements and prerequisites produce cited claims", async () => {
  const result = await buildAnswer(makePlan(
    "requirements",
    ["requirements", "eligibility"],
    "calendar",
  ), {
    pages: [{ id: "requirements-page", sourceId: "calendar", url: "https://example.test/course", title: "Course requirements", text: "Prerequisite: CSC108H1. Students must have completed the prerequisite. This course is open to students in Arts and Science.", fetchedAt: "2026-09-12T12:00:00-04:00", publishedAt: null, updatedAt: null, scope, kind: "official", contentMode: "fixture" }],
    failures: [], cleanup: "released",
  }, new AbortController().signal);
  assert.deepEqual(result.claims.map((claim) => claim.field), ["requirements", "requirements", "eligibility"]);
  assert.equal(result.requirements.length, 2);
  assert.equal(result.summary.length, 1);
});

function conflictInputs(secondQuote: string, secondAuthority: Evidence["authority"]) {
  const claims: Claim[] = [
    {
      id: "old",
      field: "deadline",
      text: "September 18",
      scope,
      nature: "fact",
      status: "supported",
      evidenceIds: ["old-evidence"],
      dateValue: { precision: "date", date: "2026-09-18", timezone: null },
    },
    {
      id: "new",
      field: "deadline",
      text: "September 20",
      scope,
      nature: "fact",
      status: "supported",
      evidenceIds: ["new-evidence"],
      dateValue: { precision: "date", date: "2026-09-20", timezone: null },
    },
  ];
  const evidence: Evidence[] = [
    { id: "old-evidence", snapshotId: "old-page", quote: "Due September 18.", authority: "institution", authorityBasis: "syllabus" },
    { id: "new-evidence", snapshotId: "new-page", quote: secondQuote, authority: secondAuthority, authorityBasis: "role label" },
  ];
  return { claims, evidence, snapshots: [] as PageSnapshot[] };
}

test("an explicit instructor extension supersedes the old deadline", () => {
  const input = conflictInputs("The deadline has been extended to September 20.", "instructor");
  const result = resolveConflicts(input.claims, input.evidence, input.snapshots);
  assert.equal(result.conflicts[0]!.resolution, "explicit_update");
  assert.equal(result.conflicts[0]!.selectedClaimId, "new");
  assert.equal(result.claims.find((item) => item.id === "old")?.status, "superseded");
  assert.deepEqual(result.keyDates.map((item) => item.claimId), ["new"]);
});

test("different dates without update language remain unresolved", () => {
  const input = conflictInputs("The deadline is September 20.", "institution");
  const result = resolveConflicts(input.claims, input.evidence, input.snapshots);
  assert.equal(result.conflicts[0]!.resolution, "unresolved");
  assert.equal(result.conflicts[0]!.selectedClaimId, null);
  assert.ok(result.claims.every((item) => item.status === "conflict"));
  assert.ok(result.keyDates.every((item) => item.status === "needs_confirmation"));
});
