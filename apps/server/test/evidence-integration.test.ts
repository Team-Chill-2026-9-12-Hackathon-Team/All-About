import type { QueryInput, QueryPlan, SourceConfig } from "@allabout/contracts";
import { buildAnswer } from "@allabout/evidence";
import { describe, expect, it } from "vitest";

import { RunExecutor } from "../src/run-executor.js";
import { RunStore } from "../src/run-store.js";
import { createMockCollectPages } from "./mock-adapters.js";

const input: QueryInput = {
  query: "When does synthetic registration close?",
  scope: {
    school: "University of Toronto",
    campus: "St. George (UTSG)",
    term: "Fall 2026",
    course: null,
    section: null,
    entity: "Synthetic registration fixture",
  },
  mode: "LIVE_FIXTURE",
};

const source: SourceConfig = {
  id: "synthetic-official",
  label: "Synthetic official fixture",
  kind: "official",
  entryUrl: "https://example.test/fixture",
  allowedHosts: ["example.test"],
  scope: input.scope,
  contentMode: "fixture",
  access: "public",
};

async function waitForTerminal(store: RunStore) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const snapshot = store.getSnapshot("run-evidence");
    if (["completed", "partial", "failed", "cancelled"].includes(snapshot.status)) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Evidence integration did not reach a terminal state.");
}

describe("B to D evidence integration", () => {
  it("accepts D's cited answer through B's executor and boundary validator", async () => {
    const store = new RunStore({ createId: () => "run-evidence" });
    store.create(input);
    const planRun = (runId: string): QueryPlan => ({
      runId,
      input,
      targets: [source],
      requestedFields: ["deadline"],
      budget: { maxPages: 3, maxSteps: 6, timeoutMs: 90_000 },
    });
    const executor = new RunExecutor({
      runStore: store,
      sources: [source],
      planRun,
      collectPages: createMockCollectPages((_plan, batch) => ({
        ...batch,
        pages: batch.pages.map((page) => ({
          ...page,
          text: "Registration closes on September 20, 2026.",
        })),
      })),
      buildAnswer,
    });

    executor.start("run-evidence");
    const snapshot = await waitForTerminal(store);

    expect(snapshot.status).toBe("completed");
    expect(snapshot.answer).toMatchObject({
      runId: "run-evidence",
      mode: "LIVE_FIXTURE",
      keyDates: [
        {
          value: { precision: "date", date: "2026-09-20" },
          status: "confirmed",
        },
      ],
    });
    expect(snapshot.answer?.evidence[0]?.quote).toBe(
      "Registration closes on September 20, 2026.",
    );
  });
});
