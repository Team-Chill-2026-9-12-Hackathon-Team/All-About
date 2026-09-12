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
      expect(recovered.json()).toMatchObject({
        status: "completed",
        lastSeq: 12,
        cleanup: "released",
      });
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
      "browser_step",
      "browser_step",
      "browser_step",
      "source_checked",
      "viewer_closed",
      "run_status",
      "answer_ready",
      "run_status",
    ]);
    expect(snapshot.cleanup).toBe("released");
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

  it("waits for clarification and resumes the same run through HTTP", async () => {
    const store = createStore();
    const executor = new RunExecutor({
      runStore: store,
      sources: [source],
      collectPages: createMockCollectPages(),
      buildAnswer: createMockBuildAnswer(),
      planRun: (runId, plannedInput, sources) => {
        if (plannedInput.scope.term === null) {
          return { question: "Which term?", missingFields: ["term"] };
        }
        return {
          runId,
          input: plannedInput,
          targets: sources,
          requestedFields: ["deadline"],
          budget: { maxPages: 3, maxSteps: 6, timeoutMs: 90_000 },
        };
      },
    });
    const app = buildApp({}, { runStore: store, sources: [source], runExecutor: executor });

    try {
      await app.inject({ method: "POST", url: "/api/runs", payload: input });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(store.getSnapshot("run-1").status).toBe("needs_input");

      const clarified = await app.inject({
        method: "POST",
        url: "/api/runs/run-1/clarification",
        payload: { scopePatch: { term: "Fall 2026" }, answer: "Fall 2026" },
      });
      expect(clarified.statusCode).toBe(200);
      expect((await waitForTerminal(store)).status).toBe("completed");
      expect(store.getInput("run-1").scope.term).toBe("Fall 2026");
    } finally {
      await app.close();
    }
  });

  it("does not wait for clarification when the client already chose sites", async () => {
    const store = createStore();
    store.create({ ...input, sourceIds: [source.id] });
    const executor = new RunExecutor({
      runStore: store,
      sources: [source],
      collectPages: createMockCollectPages(),
      buildAnswer: createMockBuildAnswer(),
      planRun: () => ({ question: "Which term?", missingFields: ["term"] }),
    });

    executor.start("run-1");
    expect((await waitForTerminal(store)).status).toBe("completed");
    expect(store.getSnapshot("run-1").status).not.toBe("needs_input");
  });

  it("fails a run when the active processing budget expires", async () => {
    const store = createStore();
    store.create(input);
    let receivedSignal: AbortSignal | undefined;
    let release!: () => void;
    const executor = new RunExecutor({
      runStore: store,
      sources: [source],
      collectPages: async (_plan, _emit, signal) => {
        receivedSignal = signal;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return { pages: [], failures: [], cleanup: "released" };
      },
      buildAnswer: createMockBuildAnswer(),
      timeoutMs: 10,
    });

    executor.start("run-1");
    expect((await waitForTerminal(store)).status).toBe("failed");
    expect(receivedSignal?.aborted).toBe(true);
    const events = store.openEventStream("run-1", 0, () => undefined).replay;
    expect(events.at(-2)).toMatchObject({ type: "run_error", payload: { code: "TIMEOUT" } });
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getSnapshot("run-1").answer).toBeNull();
  });

  it("expires a clarification wait without starting a browser adapter", async () => {
    const store = createStore();
    store.create(input);
    let browserStarted = false;
    const executor = new RunExecutor({
      runStore: store,
      sources: [source],
      collectPages: async () => {
        browserStarted = true;
        return { pages: [], failures: [], cleanup: "not_created" };
      },
      buildAnswer: createMockBuildAnswer(),
      planRun: () => ({ question: "Which term?", missingFields: ["term"] }),
      clarificationTimeoutMs: 10,
    });

    executor.start("run-1");
    expect((await waitForTerminal(store)).status).toBe("failed");
    expect(browserStarted).toBe(false);
    const events = store.openEventStream("run-1", 0, () => undefined).replay;
    expect(events.map(({ type }) => type)).toContain("clarification_needed");
    expect(events.at(-2)).toMatchObject({ type: "run_error", payload: { code: "TIMEOUT" } });
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

  it("rejects an invalid answer before it can enter the run snapshot", async () => {
    const store = createStore();
    store.create(input);
    const executor = new RunExecutor({
      runStore: store,
      sources: [source],
      collectPages: createMockCollectPages(),
      buildAnswer: createMockBuildAnswer((plan, answer) => ({
        ...answer,
        runId: `${plan.runId}-wrong`,
      })),
    });

    executor.start("run-1");
    const snapshot = await waitForTerminal(store);
    expect(snapshot.status).toBe("failed");
    expect(snapshot.answer).toBeNull();
    const events = store.openEventStream("run-1", 0, () => undefined).replay;
    expect(events.at(-2)).toMatchObject({ type: "run_error", payload: { code: "MODEL_FAILED" } });
  });
});
