import { writeFile } from "node:fs/promises";
import { collectPages } from "@allabout/browser";
import { buildAnswer } from "@allabout/evidence";

import { validateAnswerBundle } from "../src/answer-validator.js";
import { loadRootEnvironment } from "../src/config.js";
import { demo101Sources } from "../src/demo101-fixtures.js";
import { createDefaultPlan } from "../src/run-executor.js";

loadRootEnvironment();
const input = {
  query: "Did the fictional DEMO101 Assignment 2 deadline change?",
  scope: {...demo101Sources[0].scope},
  sourceIds: demo101Sources.map((source) => source.id),
  mode: "LIVE_FIXTURE" as const,
};
const plan = createDefaultPlan(`live-fixture-${Date.now()}`, input, [...demo101Sources]);
const events: string[] = [];
const startedAt = Date.now();
const batch = await collectPages(plan, (event) => events.push(event.type), new AbortController().signal);
const answer = await buildAnswer(plan, batch, new AbortController().signal);
validateAnswerBundle(plan, batch, answer);
const result = {
  generatedAt: new Date().toISOString(), elapsedMs: Date.now() - startedAt,
  mode: answer.mode, viewerReady: events.includes("session_ready"), cleanup: batch.cleanup,
  pageCount: batch.pages.length, sourceIds: batch.pages.map((page) => page.sourceId),
  fictionalLabelsPresent: batch.pages.every((page) => /fictional|demo data/i.test(page.text)),
  deadline: answer.keyDates.find((item) => item.status === "confirmed")?.value ?? null,
  conflictResolution: answer.conflicts[0]?.resolution ?? null,
  passed: events.includes("session_ready") && batch.cleanup === "released" && batch.pages.length === 3
    && batch.pages.every((page) => /fictional|demo data/i.test(page.text))
    && answer.conflicts[0]?.resolution === "explicit_update",
};
await writeFile(new URL("../../../outputs/live-fixture-acceptance.json", import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
if (!result.passed) process.exitCode = 1;
