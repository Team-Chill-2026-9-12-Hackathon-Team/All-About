import type { QueryInput, SourceConfig } from "@allabout/contracts";
import { describe, expect, it } from "vitest";

import {
  InvalidPlannerDecisionError,
  createOpenAiRunPlanner,
  materializePlannerDecision,
} from "../src/openai-planner.js";

const input: QueryInput = {
  query: "When is registration?",
  scope: {
    school: "University of Toronto",
    campus: "St. George (UTSG)",
    term: "Fall 2026",
    course: null,
    section: null,
    entity: "Registration",
  },
  mode: "LIVE_WEB",
  sourceIds: ["utsg-official"],
};

const source: SourceConfig = {
  id: "utsg-official",
  label: "UTSG official test registry entry",
  kind: "official",
  entryUrl: "https://example.test/utsg",
  allowedHosts: ["example.test"],
  scope: input.scope,
  contentMode: "live",
  access: "public",
};

const planDecision = {
  decision: "plan",
  sourceIds: [source.id],
  requestedFields: ["deadline", "submission_format"],
  question: null,
  missingFields: [],
};

describe("materializePlannerDecision", () => {
  it("builds a bounded plan only from registry sources", () => {
    const plan = materializePlannerDecision("run-1", input, [source], planDecision);
    expect(plan).toMatchObject({
      runId: "run-1",
      targets: [source],
      requestedFields: [
        "deadline",
        "submission_format",
        "event_date",
        "location",
      ],
      budget: { maxPages: 3, maxSteps: 8, timeoutMs: 90_000 },
    });
  });

  it("returns one validated clarification request", () => {
    expect(
      materializePlannerDecision("run-1", input, [source], {
        decision: "clarify",
        sourceIds: [],
        requestedFields: [],
        question: "Which term should I use?",
        missingFields: ["term", "term"],
      }),
    ).toEqual({ question: "Which term should I use?", missingFields: ["term"] });
  });

  it("rejects invented, unconfigured, out-of-scope, and disallowed sources", () => {
    const decide = (selectedSource: SourceConfig, sourceId = selectedSource.id) =>
      materializePlannerDecision("run-1", input, [selectedSource], {
        ...planDecision,
        sourceIds: [sourceId],
      });

    expect(() => decide(source, "invented-source")).toThrow(/unknown source/);
    expect(() => decide({ ...source, access: "unconfigured" })).toThrow(/unconfigured/);
    expect(() => decide({ ...source, scope: { ...source.scope, campus: "Scarborough" } })).toThrow(
      /outside the query scope/,
    );
    expect(() => decide({ ...source, id: "not-allowed" })).toThrow(/outside the user's allowlist/);
  });

  it("prevents fixture sources from masquerading as LIVE_WEB", () => {
    expect(() =>
      materializePlannerDecision("run-1", input, [{ ...source, contentMode: "fixture" }], planDecision),
    ).toThrow(/incompatible with LIVE_WEB/);
  });

  it("forces course factual fields only for course questions", () => {
    const courseInput = {
      ...input,
      query: "What are the CSC207H1 requirements?",
      scope: { ...input.scope, course: "CSC207H1", entity: null },
    };
    const plan = materializePlannerDecision("run-1", courseInput, [source], planDecision);
    if (!("requestedFields" in plan)) throw new Error("expected a query plan");
    expect(plan.requestedFields).toEqual([
      "deadline",
      "submission_format",
      "requirements",
      "eligibility",
    ]);
  });

  it("raises the browser step budget when a target needs keychain login", () => {
    const plan = materializePlannerDecision(
      "run-1",
      { ...input, sourceIds: ["quercus-login"] },
      [{ ...source, id: "quercus-login", access: "authorized" }],
      { ...planDecision, sourceIds: ["quercus-login"] },
    );
    if (!("budget" in plan)) throw new Error("expected a query plan");
    expect(plan.budget).toEqual({ maxPages: 3, maxSteps: 12, timeoutMs: 90_000 });
  });

  it("treats UTSG and St. George (UTSG) as the same campus", () => {
    const result = materializePlannerDecision(
      "run-1",
      input,
      [{ ...source, scope: { ...source.scope, campus: "UTSG" } }],
      planDecision,
    );
    expect(result).toMatchObject({ runId: "run-1", targets: [{ id: source.id }] });
  });
});

describe("createOpenAiRunPlanner", () => {
  it("uses structured output without exposing registry URLs", async () => {
    let requestBody: unknown;
    let requestSignal: AbortSignal | null | undefined;
    const client = {
      responses: {
        parse: async (body: unknown, options: { signal?: AbortSignal | null }) => {
          requestBody = body;
          requestSignal = options.signal;
          return { output_parsed: planDecision };
        },
      },
    };
    const planner = createOpenAiRunPlanner({
      apiKey: "test-only-key",
      model: "configured-model-id",
      client: client as never,
    });
    const controller = new AbortController();

    const plan = await planner("run-1", input, [source], controller.signal);
    expect(plan).toMatchObject({ runId: "run-1", targets: [source] });
    expect(requestSignal).toBe(controller.signal);
    expect(JSON.stringify(requestBody)).not.toContain(source.entryUrl);
    expect(requestBody).toMatchObject({ model: "configured-model-id", store: false });
  });

  it("rejects a response with no parsed decision", async () => {
    const client = { responses: { parse: async () => ({ output_parsed: null }) } };
    const planner = createOpenAiRunPlanner({
      apiKey: "test-only-key",
      model: "configured-model-id",
      client: client as never,
    });
    await expect(planner("run-1", input, [source], new AbortController().signal)).rejects.toBeInstanceOf(
      InvalidPlannerDecisionError,
    );
  });
});
