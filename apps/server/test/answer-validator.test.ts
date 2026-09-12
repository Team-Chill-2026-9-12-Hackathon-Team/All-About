import type { AnswerBundle, BrowserBatch, QueryPlan } from "@allabout/contracts";
import { describe, expect, it } from "vitest";

import { AnswerValidationError, validateAnswerBundle } from "../src/answer-validator.js";
import { createMockBuildAnswer, createMockCollectPages } from "./mock-adapters.js";

const scope = {
  school: "University of Toronto",
  campus: "St. George (UTSG)",
  term: "Fall 2026",
  course: null,
  section: null,
  entity: "Synthetic registration fixture",
};

const plan: QueryPlan = {
  runId: "run-validator",
  input: { query: "Synthetic test", scope, mode: "LIVE_FIXTURE" },
  targets: [
    {
      id: "synthetic-official",
      label: "Synthetic official fixture",
      kind: "official",
      entryUrl: "https://example.test/fixture",
      allowedHosts: ["example.test"],
      scope,
      contentMode: "fixture",
      access: "public",
    },
  ],
  requestedFields: ["deadline"],
  budget: { maxPages: 3, maxSteps: 6, timeoutMs: 90_000 },
};

async function fixture(): Promise<{ batch: BrowserBatch; answer: AnswerBundle }> {
  const batch = await createMockCollectPages()(plan, () => undefined, new AbortController().signal);
  const answer = await createMockBuildAnswer()(plan, batch, new AbortController().signal);
  return { batch, answer };
}

describe("validateAnswerBundle", () => {
  it("accepts a self-consistent answer built from this run's snapshots", async () => {
    const { batch, answer } = await fixture();
    expect(validateAnswerBundle(plan, batch, answer)).toEqual(answer);
  });

  it("rejects a bundle for another run or mode", async () => {
    const { batch, answer } = await fixture();
    expect(() =>
      validateAnswerBundle(plan, batch, { ...answer, runId: "run-other", mode: "REPLAY" }),
    ).toThrow(/runId does not match.*mode does not match/);
  });

  it("rejects duplicate IDs and missing claim evidence", async () => {
    const { batch, answer } = await fixture();
    const duplicateClaim = { ...answer.claims[0]!, evidenceIds: ["missing-evidence"] };
    expect(() =>
      validateAnswerBundle(plan, batch, {
        ...answer,
        claims: [duplicateClaim, duplicateClaim],
      }),
    ).toThrow(AnswerValidationError);
  });

  it("rejects evidence whose quote or snapshot is not from the browser batch", async () => {
    const { batch, answer } = await fixture();
    expect(() =>
      validateAnswerBundle(plan, batch, {
        ...answer,
        evidence: [{ ...answer.evidence[0]!, quote: "invented quote not in snapshot" }],
      }),
    ).toThrow(/quote is absent/);
    expect(() =>
      validateAnswerBundle(plan, batch, {
        ...answer,
        evidence: [{ ...answer.evidence[0]!, snapshotId: "snapshot-other-run" }],
      }),
    ).toThrow(/outside this run/);
  });

  it("allows a claim course when the query left course unspecified", async () => {
    const { batch, answer } = await fixture();
    expect(
      validateAnswerBundle(plan, batch, {
        ...answer,
        claims: [{ ...answer.claims[0]!, scope: { ...scope, course: "CSC207H1" } }],
      }),
    ).toMatchObject({ runId: plan.runId });
  });

  it("rejects mismatched claim scope and unplanned coverage", async () => {
    const { batch, answer } = await fixture();
    expect(() =>
      validateAnswerBundle(plan, batch, {
        ...answer,
        claims: [{ ...answer.claims[0]!, scope: { ...scope, campus: "Scarborough" } }],
        coverage: [{ ...answer.coverage[0]!, sourceId: "unplanned-source" }],
      }),
    ).toThrow(/claim .* scope does not match.*unplanned source/);
  });

  it("rejects public source metadata changed after collection", async () => {
    const { batch, answer } = await fixture();
    expect(() =>
      validateAnswerBundle(plan, batch, {
        ...answer,
        sources: [{ ...answer.sources[0]!, url: "https://invented.example.test/page" }],
      }),
    ).toThrow(/differs from its browser snapshot/);
  });
});
