import type { QueryInput, SourceConfig } from "@allabout/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { RunStore } from "../src/run-store.js";

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

const source: SourceConfig = {
  id: "example-official",
  label: "Example official page",
  kind: "official",
  entryUrl: "https://example.edu/private-entry",
  allowedHosts: ["example.edu"],
  scope: input.scope,
  contentMode: "live",
  access: "public",
};

function createStore() {
  let nextId = 1;
  return new RunStore({
    createId: () => `run-${nextId++}`,
    now: () => new Date("2026-09-12T16:00:00.000Z"),
  });
}

function buildRouteApp(store = createStore(), sources: SourceConfig[] = []) {
  return buildApp(
    {},
    {
      runStore: store,
      sources,
      runExecutor: {
        start: () => undefined,
        cancel: (runId) => store.cancel(runId),
      },
    },
  );
}

function parseSse(body: string) {
  return body
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const data = lines.find((line) => line.startsWith("data: "));
      if (!data) throw new Error("Missing SSE data line.");
      return JSON.parse(data.slice(6)) as { seq: number; type: string };
    });
}

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("run HTTP API", () => {
  it("returns 503 instead of leaving a run queued when execution is unavailable", async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({ method: "POST", url: "/api/runs", payload: input });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: "RUN_EXECUTION_UNAVAILABLE",
        message: "Run execution is not configured on this server.",
      },
    });
  });

  it("lists only public source summary fields", async () => {
    const app = buildRouteApp(createStore(), [source]);
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/sources" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: "example-official",
        label: "Example official page",
        kind: "official",
        access: "public",
      },
    ]);
  });

  it("creates a queued run and makes it recoverable by ID", async () => {
    const app = buildRouteApp();
    apps.push(app);

    const created = await app.inject({ method: "POST", url: "/api/runs", payload: input });
    expect(created.statusCode).toBe(202);
    expect(created.json()).toEqual({
      runId: "run-1",
      eventsUrl: "/api/runs/run-1/events",
      status: "queued",
    });

    const recovered = await app.inject({ method: "GET", url: "/api/runs/run-1" });
    expect(recovered.statusCode).toBe(200);
    expect(recovered.json()).toEqual({
      runId: "run-1",
      status: "queued",
      answer: null,
      lastSeq: 1,
      cleanup: null,
      viewerUrl: null,
    });
  });

  it("rejects invalid input, unknown runs, and a second active run", async () => {
    const app = buildRouteApp();
    apps.push(app);

    const invalid = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { query: "Missing scope" },
    });
    expect(invalid.statusCode).toBe(400);

    await app.inject({ method: "POST", url: "/api/runs", payload: input });
    const conflict = await app.inject({ method: "POST", url: "/api/runs", payload: input });
    expect(conflict.statusCode).toBe(409);

    const missing = await app.inject({ method: "GET", url: "/api/runs/not-found" });
    expect(missing.statusCode).toBe(404);
  });

  it("accepts clarification only while the run needs input", async () => {
    const store = createStore();
    store.create(input);
    store.transition("run-1", "planning");
    store.transition("run-1", "needs_input");
    const app = buildRouteApp(store);
    apps.push(app);

    const clarified = await app.inject({
      method: "POST",
      url: "/api/runs/run-1/clarification",
      payload: { scopePatch: { term: "Fall 2026" }, answer: "Fall 2026" },
    });
    expect(clarified.statusCode).toBe(200);
    expect(clarified.json()).toMatchObject({ status: "planning", lastSeq: 4 });
    expect(store.getInput("run-1").scope.term).toBe("Fall 2026");

    const repeated = await app.inject({
      method: "POST",
      url: "/api/runs/run-1/clarification",
      payload: { scopePatch: {}, answer: "Again" },
    });
    expect(repeated.statusCode).toBe(409);
  });

  it("cancels idempotently and permits a new run", async () => {
    const app = buildRouteApp();
    apps.push(app);
    await app.inject({ method: "POST", url: "/api/runs", payload: input });

    const cancelled = await app.inject({
      method: "POST",
      url: "/api/runs/run-1/cancel",
    });
    expect(cancelled.statusCode).toBe(202);
    expect(cancelled.json()).toEqual({ runId: "run-1", status: "cancelled" });

    const repeated = await app.inject({
      method: "POST",
      url: "/api/runs/run-1/cancel",
    });
    expect(repeated.statusCode).toBe(202);
    expect(repeated.json()).toEqual({ runId: "run-1", status: "cancelled" });

    const nextRun = await app.inject({ method: "POST", url: "/api/runs", payload: input });
    expect(nextRun.statusCode).toBe(202);
    expect(nextRun.json().runId).toBe("run-2");
  });
});

describe("run event stream", () => {
  it("replays persisted terminal events to a late connection", async () => {
    const store = createStore();
    store.create(input);
    store.cancel("run-1");
    const app = buildRouteApp(store);
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/runs/run-1/events" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(parseSse(response.body).map(({ seq, type }) => ({ seq, type }))).toEqual([
      { seq: 1, type: "run_status" },
      { seq: 2, type: "run_status" },
      { seq: 3, type: "run_status" },
    ]);
  });

  it("resumes after Last-Event-ID without duplicating acknowledged events", async () => {
    const store = createStore();
    store.create(input);
    store.cancel("run-1");
    const app = buildRouteApp(store);
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/runs/run-1/events",
      headers: { "last-event-id": "run-1:1" },
    });

    expect(parseSse(response.body).map((event) => event.seq)).toEqual([2, 3]);
  });

  it("rejects cross-run and future event cursors", async () => {
    const store = createStore();
    store.create(input);
    store.cancel("run-1");
    const app = buildRouteApp(store);
    apps.push(app);

    const crossRun = await app.inject({
      method: "GET",
      url: "/api/runs/run-1/events",
      headers: { "last-event-id": "run-other:1" },
    });
    expect(crossRun.statusCode).toBe(400);

    const future = await app.inject({
      method: "GET",
      url: "/api/runs/run-1/events",
      headers: { "last-event-id": "run-1:4" },
    });
    expect(future.statusCode).toBe(409);
  });

  it("inherits course context from a finished parent run", async () => {
    const store = createStore();
    const app = buildRouteApp(store);
    apps.push(app);

    const parent = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: {
        ...input,
        query: "Did the DEMO101 A2 deadline change?",
        scope: { ...input.scope, course: "DEMO101", term: "Fall 2026", entity: "Assignment 2" },
        sourceIds: ["demo101-syllabus"],
        mode: "LIVE_FIXTURE",
      },
    });
    expect(parent.statusCode).toBe(202);
    await app.inject({ method: "POST", url: "/api/runs/run-1/cancel" });

    const child = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: {
        query: "What about the late penalty?",
        scope: {
          school: "University of Toronto",
          campus: "UTSG",
          term: null,
          course: null,
          section: null,
          entity: null,
        },
        mode: "LIVE_WEB",
        parentRunId: "run-1",
      },
    });
    expect(child.statusCode).toBe(202);
    expect(store.getInput("run-2")).toMatchObject({
      mode: "LIVE_FIXTURE",
      scope: { course: "DEMO101", entity: "Assignment 2", term: "Fall 2026" },
      sourceIds: ["demo101-syllabus"],
    });
  });
});
