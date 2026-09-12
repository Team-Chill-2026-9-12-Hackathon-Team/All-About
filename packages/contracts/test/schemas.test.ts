import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  AnswerBundleSchema,
  BrowserBatchSchema,
  ClarificationRequestSchema,
  CreateRunResponseSchema,
  EventEnvelopeSchema,
  PageSnapshotSchema,
  QueryInputSchema,
  QueryPlanSchema,
  RunSnapshotSchema,
  SourceSummarySchema,
  SseEventIdSchema,
} from "../src/index.js";

async function readExample(name: string): Promise<unknown> {
  const path = fileURLToPath(new URL(`../examples/${name}`, import.meta.url));
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

describe("contract examples", () => {
  it("validates the shared input and module boundary examples", async () => {
    QueryInputSchema.parse(await readExample("query-input.json"));
    QueryPlanSchema.parse(await readExample("query-plan.json"));
    BrowserBatchSchema.parse(await readExample("browser-batch.json"));
    AnswerBundleSchema.parse(await readExample("answer-bundle.json"));
  });

  it("validates every SSE event example", async () => {
    const events = await readExample("events.json");
    expect(Array.isArray(events)).toBe(true);

    for (const event of events as unknown[]) {
      EventEnvelopeSchema.parse(event);
    }
  });
});

describe("boundary rejection", () => {
  it("rejects missing scope fields rather than guessing them", () => {
    expect(() =>
      QueryInputSchema.parse({
        query: "When is registration?",
        scope: { school: "University of Toronto" },
        mode: "LIVE_WEB",
      }),
    ).toThrow();
  });

  it("rejects invalid timestamps and source kinds", () => {
    expect(() =>
      PageSnapshotSchema.parse({
        id: "snapshot-1",
        sourceId: "source-1",
        url: "https://example.edu",
        title: "Example",
        text: "Visible text",
        fetchedAt: "today",
        publishedAt: null,
        updatedAt: null,
        scope: {
          school: null,
          campus: null,
          term: null,
          course: null,
          section: null,
          entity: null,
        },
        kind: "blog",
        contentMode: "live",
      }),
    ).toThrow();
  });

  it("rejects an event whose payload does not match its type", () => {
    expect(() =>
      EventEnvelopeSchema.parse({
        schemaVersion: "1",
        runId: "run-1",
        seq: 1,
        at: "2026-09-12T12:00:00-04:00",
        type: "run_status",
        payload: { code: "TIMEOUT", message: "Timed out", retryable: true },
      }),
    ).toThrow();
  });
});

describe("run API contracts", () => {
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
  };

  it("validates public run, source, and clarification shapes", () => {
    SourceSummarySchema.parse({
      id: "academic-calendar",
      label: "Academic Calendar",
      kind: "official",
      access: "public",
    });
    CreateRunResponseSchema.parse({
      runId: "run-1",
      eventsUrl: "/api/runs/run-1/events",
      queued: true,
    });
    RunSnapshotSchema.parse({
      runId: "run-1",
      input,
      status: "queued",
      bundle: null,
      lastEventSeq: 1,
      cleanup: null,
    });
    ClarificationRequestSchema.parse({
      scope: input.scope,
      answer: "Fall 2026",
    });
    SseEventIdSchema.parse("run-1:2");
  });

  it("rejects malformed run API payloads", () => {
    expect(() =>
      CreateRunResponseSchema.parse({
        runId: "run-1",
        eventsUrl: "/events",
        queued: true,
      }),
    ).toThrow();
    expect(() => SseEventIdSchema.parse("run-1:0")).toThrow();
    expect(() =>
      ClarificationRequestSchema.parse({ scope: input.scope, answer: " " }),
    ).toThrow();
  });
});
