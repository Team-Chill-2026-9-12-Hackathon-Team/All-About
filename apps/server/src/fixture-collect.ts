import { BrowserBatchSchema, type BrowserBatch, type BrowserSignal, type QueryPlan } from "@allabout/contracts";

import { demo101Snapshot } from "./demo101-fixtures.js";

export function shouldCollectFixtures(plan: QueryPlan): boolean {
  return plan.input.mode === "LOCAL_FIXTURE";
}

export async function collectFixturePages(
  plan: QueryPlan,
  emit: (signal: BrowserSignal) => void,
  signal: AbortSignal,
): Promise<BrowserBatch> {
  const pages = [];
  const failures = [];
  for (const target of plan.targets.slice(0, plan.budget.maxPages)) {
    if (signal.aborted) {
      failures.push({
        sourceId: target.id,
        code: "CANCELLED" as const,
        message: "The fixture run was cancelled.",
        retryable: true,
      });
      continue;
    }
    emit({ type: "step", sourceId: target.id, action: "navigate", url: target.entryUrl });
    const snapshot = demo101Snapshot(target.id, plan.runId, new Date().toISOString());
    if (!snapshot) {
      failures.push({
        sourceId: target.id,
        code: "UNSUPPORTED_SOURCE" as const,
        message: "No local fixture is registered for this source.",
        retryable: false,
      });
      emit({
        type: "source_failed",
        failure: failures[failures.length - 1]!,
      });
      continue;
    }
    emit({ type: "step", sourceId: target.id, action: "read_visible_text", url: snapshot.url });
    emit({ type: "page_read", snapshot });
    pages.push(snapshot);
  }
  return BrowserBatchSchema.parse({ pages, failures, cleanup: "not_created" });
}
