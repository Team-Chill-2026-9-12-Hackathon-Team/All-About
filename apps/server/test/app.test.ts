import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";
import type {
  BrowserBatch,
  BrowserSignal,
  CollectPages,
  EventEnvelope,
  QueryInput,
} from "@allabout/contracts";

import { buildApp } from "../src/app.js";
import { RunStore } from "../src/run-store.js";

const apps: ReturnType<typeof buildApp>[] = [];
const input = {
  query: "When is course registration?",
  scope: {
    school: "University of Toronto",
    campus: "UTSG",
    term: null,
    course: null,
    section: null,
    entity: null,
  },
  mode: "LIVE_WEB",
} satisfies QueryInput;

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("GET /api/health", () => {
  it("reports a healthy server without exposing configuration", async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });
});

describe("POST /api/browser/collect", () => {
  it("validates the shared query plan and returns browser signals with the batch", async () => {
    const batch: BrowserBatch = { pages: [], failures: [], cleanup: "released" };
    const collectPages: CollectPages = async (_plan, emit) => {
      const signal: BrowserSignal = {
        type: "session_ready",
        viewerUrl: "https://api.steel.dev/v1/sessions/test/debug?interactive=false",
      };
      emit(signal);
      return batch;
    };
    const app = buildApp({}, { collectPages });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/browser/collect",
      payload: {
        runId: "run-test",
        input: {
          query: "UofT events",
          scope: {
            school: "University of Toronto",
            campus: "UTSG",
            term: null,
            course: null,
            section: null,
            entity: null,
          },
          mode: "LIVE_WEB",
        },
        targets: [],
        requestedFields: ["events"],
        budget: { maxPages: 2, maxSteps: 4, timeoutMs: 30000 },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      batch,
      signals: [
        {
          type: "session_ready",
          viewerUrl: "https://api.steel.dev/v1/sessions/test/debug?interactive=false",
        },
      ],
    });
  });

  it("rejects a body that is not a QueryPlan", async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/api/browser/collect",
      payload: { query: "missing plan fields" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("INVALID_QUERY_PLAN");
  });
});

describe("B2 run API", () => {
  it("lists the provisional public UTSG source catalog", async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/api/sources" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      sources: [
        {
          id: "academic-calendar",
          label: "U of T Academic Calendar",
          kind: "official",
          access: "public",
        },
        {
          id: "uoft-events",
          label: "University of Toronto Events",
          kind: "official",
          access: "public",
        },
      ],
    });
  });

  it("creates a run, provides its snapshot, and rejects another active run", async () => {
    const app = buildApp();
    apps.push(app);

    const created = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: input,
    });
    const createBody = created.json();

    expect(created.statusCode).toBe(202);
    expect(createBody).toMatchObject({
      runId: expect.stringMatching(/^run-/),
      eventsUrl: expect.stringMatching(/^\/api\/runs\/run-.+\/events$/),
      queued: true,
    });

    const status = await app.inject({
      method: "GET",
      url: `/api/runs/${createBody.runId}`,
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({
      runId: createBody.runId,
      input,
      status: "queued",
      bundle: null,
      lastEventSeq: 1,
      cleanup: null,
    });

    const conflict = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: input,
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({
      error: "ACTIVE_RUN",
      runId: createBody.runId,
    });
  });

  it("validates input and reports unknown runs", async () => {
    const app = buildApp();
    apps.push(app);

    const invalid = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: { query: "missing scope" },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error).toBe("INVALID_QUERY_INPUT");

    for (const url of ["/api/runs/unknown", "/api/runs/unknown/cancel"]) {
      const response = await app.inject({
        method: url.endsWith("/cancel") ? "POST" : "GET",
        url,
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "RUN_NOT_FOUND" });
    }
  });

  it("cancels idempotently and permits another run", async () => {
    const app = buildApp();
    apps.push(app);

    const created = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: input,
    });
    const { runId } = created.json();

    const firstCancel = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/cancel`,
    });
    expect(firstCancel.statusCode).toBe(202);
    expect(firstCancel.json().run).toMatchObject({
      status: "cancelled",
      lastEventSeq: 3,
    });

    const repeatedCancel = await app.inject({
      method: "POST",
      url: `/api/runs/${runId}/cancel`,
    });
    expect(repeatedCancel.statusCode).toBe(202);
    expect(repeatedCancel.json().run.lastEventSeq).toBe(3);

    const nextRun = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: input,
    });
    expect(nextRun.statusCode).toBe(202);
  });

  it("accepts clarification only while a run needs input", async () => {
    const store = new RunStore();
    const app = buildApp({}, { runStore: store });
    apps.push(app);
    const run = store.create(input);

    const notWaiting = await app.inject({
      method: "POST",
      url: `/api/runs/${run.runId}/clarification`,
      payload: { scope: input.scope, answer: "Fall 2026" },
    });
    expect(notWaiting.statusCode).toBe(409);

    store.setStatus(run.runId, "needs_input");
    const accepted = await app.inject({
      method: "POST",
      url: `/api/runs/${run.runId}/clarification`,
      payload: {
        scope: { ...input.scope, term: "Fall 2026" },
        answer: "Fall 2026",
      },
    });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json().run).toMatchObject({
      status: "planning",
      input: { scope: { term: "Fall 2026" } },
    });
  });

  it("rejects malformed SSE replay cursors before opening a stream", async () => {
    const app = buildApp();
    apps.push(app);

    const response = await app.inject({
      method: "GET",
      url: "/api/runs/unknown/events",
      headers: { "last-event-id": "unknown:0" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "INVALID_LAST_EVENT_ID" });
  });
});

describe("RunStore SSE replay", () => {
  it("replays only missed events and keeps subscribers connected for new events", () => {
    const store = new RunStore();
    const run = store.create(input);
    store.setStatus(run.runId, "planning");
    const received: EventEnvelope[] = [];

    const subscription = store.subscribeAfter(run.runId, 1, (event) => received.push(event));
    expect(subscription?.events.map((event) => event.seq)).toEqual([2]);

    store.setStatus(run.runId, "needs_input");
    expect(received.map((event) => event.seq)).toEqual([3]);

    subscription?.unsubscribe();
    store.setStatus(run.runId, "cancelled");
    expect(received).toHaveLength(1);

    const reconnect = store.subscribeAfter(run.runId, 2, () => undefined);
    expect(reconnect?.events.map((event) => event.seq)).toEqual([3, 4]);
  });

  it("writes replayed events with the standard SSE fields", async () => {
    const store = new RunStore();
    const app = buildApp({}, { runStore: store });
    apps.push(app);
    const run = store.create(input);
    store.setStatus(run.runId, "planning");

    await app.listen({ host: "127.0.0.1", port: 0 });
    const { port } = app.server.address() as AddressInfo;
    const controller = new AbortController();
    const response = await fetch(`http://127.0.0.1:${port}/api/runs/${run.runId}/events`, {
      headers: { "last-event-id": `${run.runId}:1` },
      signal: controller.signal,
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const chunk = await reader?.read();
    const text = new TextDecoder().decode(chunk?.value);
    expect(text).toContain(`id: ${run.runId}:2`);
    expect(text).toContain("event: run_status");
    expect(text).toContain('"status":"planning"');

    await reader?.cancel();
    controller.abort();
  });
});
