import { afterEach, describe, expect, it } from "vitest";
import type { BrowserBatch, BrowserSignal, CollectPages } from "@allabout/contracts";

import { buildApp } from "../src/app.js";

const apps: ReturnType<typeof buildApp>[] = [];

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
