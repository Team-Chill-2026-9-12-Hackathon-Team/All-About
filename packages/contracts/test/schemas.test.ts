import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  AnswerBundleSchema,
  BrowserBatchSchema,
  EventEnvelopeSchema,
  PageSnapshotSchema,
  QueryInputSchema,
  QueryPlanSchema,
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
