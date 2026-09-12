import { buildAnswer } from "./index.js";
import type { BrowserBatch, QueryPlan, Scope, SourceConfig } from "@allabout/contracts";

const scope: Scope = {
  school: "University of Toronto",
  campus: null,
  term: "Fall 2026",
  course: null,
  section: null,
  entity: "Battle of the Schools",
};

const plan: QueryPlan = {
  runId: "smoke-run",
  input: { query: "When is registration due?", scope, mode: "LIVE_FIXTURE" },
  requestedFields: ["deadline"],
  targets: [{
    id: "official-event",
    kind: "official",
    label: "Demo data · Fictional activity",
    entryUrl: "https://example.test/event",
    allowedHosts: ["example.test"],
    scope,
    contentMode: "fixture",
    access: "public",
  } satisfies SourceConfig],
  budget: { maxPages: 1, maxSteps: 3, timeoutMs: 30_000 },
};

const batch: BrowserBatch = {
  pages: [{
    id: "snapshot-1",
    sourceId: "official-event",
    url: "https://example.test/event",
    title: "Event details",
    text: "Registration closes on September 20, 2026. Teams will receive confirmation by email.",
    fetchedAt: new Date().toISOString(),
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
console.log(JSON.stringify(result, null, 2));
