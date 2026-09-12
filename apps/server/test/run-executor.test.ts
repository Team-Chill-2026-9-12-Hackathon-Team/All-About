import type { CollectPages, QueryInput, SourceConfig } from "@allabout/contracts";
import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { RunExecutor } from "../src/run-executor.js";
import { RunStore } from "../src/run-store.js";
import { createMockBuildAnswer, createMockCollectPages } from "./mock-adapters.js";

const input: QueryInput = {
  query: "When does the synthetic registration fixture open?",
  scope: {
    school: "University of Toronto",
    campus: "St. George (UTSG)",
    term: null,
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

function createStore() {
  return new RunStore({
    createId: () => "run-1",
    now: () => new Date("2026-09-12T16:00:00.000Z"),
  });
}

async function waitForTerminal(store: RunStore) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const snapshot = store.getSnapshot("run-1");
    if (["completed", "partial", "failed", "cancelled"].includes(snapshot.status)) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Executor did not reach a terminal state.");
}

describe("RunExecutor", () => {
  it("starts through POST /api/runs when explicitly injected", async () => {
    const store = createStore();
    const executor = new RunExecutor({
      runStore: store,
      sources: [source],
      collectPages: createMockCollectPages(),
      buildAnswer: createMockBuildAnswer(),
    });
    const app = buildApp({}, { runStore: store, sources: [source], runExecutor: executor });

    try {
      const created = await app.inject({ method: "POST", url: "/api/runs", payload: input });
      expect(created.statusCode).toBe(202);
      expect(created.json()).toMatchObject({ runId: "run-1", status: "queued" });

      const snapshot = await waitForTerminal(store);
      expect(snapshot.status).toBe("completed");
      const recovered = await app.inject({ method: "GET", url: "/api/runs/run-1" });
      expect(recovered.json()).toMatchObject({ status: "completed", lastSeq: 10 });
    } finally {
      await app.close();
    }
  });

  it("runs injected adapters and persists the complete event history", async () => {
    const store = createStore();
    store.create(input);
    const executor = new RunExecutor({
      runStore: store,
      sources: [source],
      collectPages: createMockCollectPages(),
      buildAnswer: createMockBuildAnswer(),
    });

    executor.start("run-1");
    const snapshot = await waitForTerminal(store);
    expect(snapshot.status).toBe("completed");
    expect(snapshot.answer?.summary[0]?.text).toContain("September 15, 2026");

    const events = store.openEventStream("run-1", 0, () => undefined).replay;
    expect(events.map(({ type }) => type)).toEqual([
      "run_status",
      "run_status",
      "run_status",
      "viewer_ready",
      "browser_step",
      "source_checked",
      "viewer_closed",
      "run_status",
      "answer_ready",
      "run_status",
    ]);
  });

  it("marks a result partial when an adapter reports unknowns", async () => {
    const store = createStore();
    store.create(input);
    const executor = new RunExecutor({
      runStore: store,
      sources: [source],
      collectPages: createMockCollectPages(),
      buildAnswer: createMockBuildAnswer((plan, answer) => ({
        ...answer,
        unknowns: ["Synthetic unknown for partial-path testing."],
      })),
    });

    executor.start("run-1");
    expect((await waitForTerminal(store)).status).toBe("partial");
  });

  it("aborts an active adapter and ignores its late result after cancellation", async () => {
    const store = createStore();
    store.create(input);
    let release!: () => void;
    let receivedSignal: AbortSignal | undefined;
    const collectPages: CollectPages = async (_plan, _emit, signal) => {
      receivedSignal = signal;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { pages: [], failures: [], cleanup: "released" };
    };
    const executor = new RunExecutor({
      runStore: store,
      sources: [source],
      collectPages,
      buildAnswer: createMockBuildAnswer(),
    });

    executor.start("run-1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getSnapshot("run-1").status).toBe("browsing");
    executor.cancel("run-1");
    expect(receivedSignal?.aborted).toBe(true);
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const snapshot = store.getSnapshot("run-1");
    expect(snapshot.status).toBe("cancelled");
    expect(snapshot.answer).toBeNull();
  });

  it("converts adapter failures into a stable failed run", async () => {
    const store = createStore();
    store.create(input);
    const executor = new RunExecutor({
      runStore: store,
      sources: [source],
      collectPages: async () => {
        throw new Error("Synthetic adapter failure.");
      },
      buildAnswer: createMockBuildAnswer(),
    });

    executor.start("run-1");
    expect((await waitForTerminal(store)).status).toBe("failed");
    const events = store.openEventStream("run-1", 0, () => undefined).replay;
    expect(events.at(-2)).toMatchObject({
      type: "run_error",
      payload: { code: "NAVIGATION_FAILED", message: "Synthetic adapter failure." },
    });
  });
});
