import type { QueryInput } from "@allabout/contracts";
import { describe, expect, it } from "vitest";

import {
  ActiveRunConflictError,
  InvalidEventCursorError,
  InvalidRunTransitionError,
  RunStore,
} from "../src/run-store.js";

const input: QueryInput = {
  query: "When is registration?",
  scope: {
    school: "University of Toronto",
    campus: "St. George (UTSG)",
    term: null,
    course: null,
    section: null,
    entity: "Example event",
  },
  mode: "LIVE_WEB",
};

function createStore() {
  let nextId = 1;
  return new RunStore({
    createId: () => `run-${nextId++}`,
    now: () => new Date("2026-09-12T16:00:00.000Z"),
  });
}

describe("RunStore", () => {
  it("persists the queued event before returning a new run", () => {
    const store = createStore();

    expect(store.create(input)).toEqual({
      runId: "run-1",
      status: "queued",
      answer: null,
      lastSeq: 1,
      cleanup: null,
      viewerUrl: null,
    });

    const stream = store.openEventStream("run-1", 0, () => undefined);
    expect(stream.replay).toMatchObject([
      { runId: "run-1", seq: 1, type: "run_status", payload: { status: "queued" } },
    ]);
    stream.unsubscribe();
  });

  it("allows only one active run and permits another after cancellation", () => {
    const store = createStore();
    store.create(input);

    expect(() => store.create(input)).toThrow(ActiveRunConflictError);
    expect(store.cancel("run-1").status).toBe("cancelled");
    expect(store.create(input).runId).toBe("run-2");
  });

  it("enforces the documented state machine", () => {
    const store = createStore();
    store.create(input);
    store.transition("run-1", "planning");
    store.transition("run-1", "browsing");
    store.transition("run-1", "synthesizing");
    store.transition("run-1", "completed");

    expect(store.getSnapshot("run-1")).toMatchObject({
      status: "completed",
      lastSeq: 5,
    });
    expect(() => store.transition("run-1", "planning")).toThrow(
      InvalidRunTransitionError,
    );
  });

  it("replays missed events and then delivers live events in sequence", () => {
    const store = createStore();
    store.create(input);
    store.transition("run-1", "planning");
    const liveEvents: number[] = [];

    const stream = store.openEventStream("run-1", 1, (event) => {
      liveEvents.push(event.seq);
    });
    expect(stream.replay.map((event) => event.seq)).toEqual([2]);

    store.transition("run-1", "needs_input");
    expect(liveEvents).toEqual([3]);
    stream.unsubscribe();
  });

  it("rejects a cursor ahead of the persisted event sequence", () => {
    const store = createStore();
    store.create(input);

    expect(() =>
      store.openEventStream("run-1", 2, () => undefined),
    ).toThrow(InvalidEventCursorError);
  });

  it("merges explicit clarification only from needs_input", () => {
    const store = createStore();
    store.create(input);
    store.transition("run-1", "planning");
    store.transition("run-1", "needs_input");

    store.applyClarification("run-1", { term: "Fall 2026" }, "Fall 2026");

    expect(store.getSnapshot("run-1").status).toBe("planning");
    expect(store.getInput("run-1").scope.term).toBe("Fall 2026");
    expect(store.getClarificationAnswer("run-1")).toBe("Fall 2026");
  });

  it("makes cancellation idempotent", () => {
    const store = createStore();
    store.create(input);

    expect(store.cancel("run-1")).toMatchObject({ status: "cancelled", lastSeq: 3 });
    expect(store.cancel("run-1")).toMatchObject({ status: "cancelled", lastSeq: 3 });
  });

  it("records cleanup after termination and suppresses expired viewer URLs from replay", () => {
    const store = createStore();
    store.create(input);
    store.transition("run-1", "planning");
    store.transition("run-1", "browsing");
    store.appendEvent("run-1", "viewer_ready", {
      viewerUrl: "https://viewer.example.test/session",
      interactive: false,
    });
    expect(store.getSnapshot("run-1").viewerUrl).toBe("https://viewer.example.test/session");
    store.appendEvent("run-1", "viewer_closed", { reason: "released" });
    expect(store.getSnapshot("run-1").viewerUrl).toBeNull();
    store.transition("run-1", "failed");

    expect(store.setCleanup("run-1", "released").cleanup).toBe("released");
    expect(store.openEventStream("run-1", 0, () => undefined).replay.map(({ type }) => type))
      .not.toContain("viewer_ready");
  });
});
