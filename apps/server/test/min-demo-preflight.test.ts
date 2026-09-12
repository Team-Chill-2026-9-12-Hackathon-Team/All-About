import type {
  EventEnvelope,
  QueryInput,
  QueryPlan,
  SourceConfig,
} from "@allabout/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { createRunRuntime } from "../src/runtime.js";
import { RunStore } from "../src/run-store.js";
import { createMockCollectPages } from "./mock-adapters.js";

const input: QueryInput = {
  query: "When does the synthetic registration close?",
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
  id: "synthetic-min-demo",
  label: "Synthetic minimum demo fixture",
  kind: "official",
  entryUrl: "https://example.test/min-demo",
  allowedHosts: ["example.test"],
  scope: input.scope,
  contentMode: "fixture",
  access: "public",
};

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function waitForTerminal(store: RunStore) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const snapshot = store.getSnapshot("run-min-demo");
    if (["completed", "partial", "failed", "cancelled"].includes(snapshot.status)) {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Minimum demo preflight did not reach a terminal state.");
}

function parseSse(body: string): EventEnvelope[] {
  return body
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice("data: ".length)) as EventEnvelope);
}

describe("minimum demo synthetic preflight", () => {
  it("runs HTTP -> B -> mock C -> real D -> SSE without exposing registry URLs", async () => {
    const runStore = new RunStore({ createId: () => "run-min-demo" });
    const planRun = (runId: string): QueryPlan => ({
      runId,
      input,
      targets: [source],
      requestedFields: ["deadline"],
      budget: { maxPages: 3, maxSteps: 6, timeoutMs: 90_000 },
    });
    const runtime = createRunRuntime({
      sources: [source],
      runStore,
      planRun,
      collectPages: createMockCollectPages((_plan, batch) => ({
        ...batch,
        pages: batch.pages.map((page) => ({
          ...page,
          text: "Registration closes on September 20, 2026.",
        })),
      })),
    });
    const app = buildApp(
      {},
      {
        runStore: runtime.runStore,
        sources: runtime.sources,
        runExecutor: runtime.runExecutor,
      },
    );
    apps.push(app);

    const sources = await app.inject({ method: "GET", url: "/api/sources" });
    expect(sources.statusCode).toBe(200);
    expect(sources.json()).toEqual([
      {
        id: source.id,
        label: source.label,
        kind: source.kind,
        access: source.access,
      },
    ]);
    expect(sources.body).not.toContain(source.entryUrl);

    const created = await app.inject({
      method: "POST",
      url: "/api/runs",
      payload: input,
    });
    expect(created.statusCode).toBe(202);
    expect(created.json()).toMatchObject({
      runId: "run-min-demo",
      status: "queued",
      eventsUrl: "/api/runs/run-min-demo/events",
    });

    const terminal = await waitForTerminal(runStore);
    expect(terminal.status).toBe("completed");
    expect(terminal.answer?.keyDates[0]?.value).toMatchObject({
      precision: "date",
      date: "2026-09-20",
    });

    const eventsResponse = await app.inject({
      method: "GET",
      url: "/api/runs/run-min-demo/events",
    });
    expect(eventsResponse.statusCode).toBe(200);
    const eventTypes = parseSse(eventsResponse.body).map(({ type }) => type);
    expect(eventTypes).toEqual([
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
  });
});
