import { writeFile } from "node:fs/promises";
import { collectPages } from "@allabout/browser";
import { buildAnswer } from "@allabout/evidence";
import { type QueryInput, QueryPlanSchema } from "@allabout/contracts";

import { validateAnswerBundle } from "../src/answer-validator.js";
import { loadRootEnvironment } from "../src/config.js";
import { createDefaultPlan } from "../src/run-executor.js";
import { liveSourceRegistry } from "../src/source-registry.js";

loadRootEnvironment();

const input: QueryInput = {
  query: "When and where is the Labour Day Carillon Recital, who can attend, and what is the Soldiers' Tower carillon?",
  scope: {
    school: "University of Toronto", campus: "UTSG", term: null, course: null,
    section: null, entity: "Labour Day Carillon Recital",
  },
  sourceIds: ["alumni-carillon-recital", "soldiers-tower-features"],
  mode: "LIVE_WEB",
};

const results = [];
let consecutivePasses = 0;
for (let attempt = 1; attempt <= 8 && consecutivePasses < 3; attempt += 1) {
  const runId = `live-acceptance-${Date.now()}-${attempt}`;
  const base = createDefaultPlan(runId, input, liveSourceRegistry);
  const plan = QueryPlanSchema.parse({
    ...base,
    requestedFields: ["event_date", "event_time", "location", "eligibility", "event_description"],
    budget: {...base.budget, maxPages: 2, maxSteps: 10, timeoutMs: 90_000},
  });
  const events: string[] = [];
  const startedAt = Date.now();
  try {
    const batch = await collectPages(plan, (event) => events.push(event.type), new AbortController().signal);
    const answer = await buildAnswer(plan, batch, new AbortController().signal);
    validateAnswerBundle(plan, batch, answer);
    const contributingSources = new Set(
      answer.evidence.flatMap((item) => {
        const snapshot = batch.pages.find((page) => page.id === item.snapshotId);
        return snapshot ? [snapshot.sourceId] : [];
      }),
    );
    const supportedFacts = answer.claims.filter((claim) => claim.status === "supported" && claim.nature === "fact");
    const passed = batch.cleanup === "released"
      && events.includes("session_ready")
      && batch.pages.length === 2
      && supportedFacts.length >= 3
      && answer.keyDates.length >= 1
      && contributingSources.size === 2;
    consecutivePasses = passed ? consecutivePasses + 1 : 0;
    results.push({
      attempt, runId, passed, elapsedMs: Date.now() - startedAt,
      mode: answer.mode, cleanup: batch.cleanup, viewerReady: events.includes("session_ready"),
      pageCount: batch.pages.length, supportedFactCount: supportedFacts.length,
      evidenceCount: answer.evidence.length, keyDateCount: answer.keyDates.length,
      contributingSources: [...contributingSources], failures: batch.failures,
      consecutivePasses,
    });
  } catch (error) {
    consecutivePasses = 0;
    results.push({
      attempt, runId, passed: false, elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Unknown live verification error",
      consecutivePasses,
    });
  }
  console.log(JSON.stringify(results.at(-1)));
  if (consecutivePasses < 3) await new Promise((resolve) => setTimeout(resolve, 12_000));
}

const report = {
  generatedAt: new Date().toISOString(),
  question: input.query,
  passed: consecutivePasses >= 3,
  consecutivePasses,
  results,
};
await writeFile(new URL("../../../outputs/live-web-acceptance.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
