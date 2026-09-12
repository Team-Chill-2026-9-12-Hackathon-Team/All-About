import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { QueryInput, QueryPlan, SourceConfig } from "@allabout/contracts";

import type { ClarificationPlan, RunPlanner } from "./run-executor.js";

const scopeFieldSchema = z.enum([
  "school",
  "campus",
  "term",
  "course",
  "section",
  "entity",
]);
const requestedFieldSchema = z.enum([
  "deadline",
  "submission_format",
  "eligibility",
  "location",
  "requirements",
  "registration_process",
  "contact",
  "other",
]);

export const PlannerDecisionSchema = z.strictObject({
  decision: z.enum(["plan", "clarify"]),
  sourceIds: z.array(z.string()),
  requestedFields: z.array(requestedFieldSchema),
  question: z.string().nullable(),
  missingFields: z.array(scopeFieldSchema),
});

export type PlannerDecision = z.infer<typeof PlannerDecisionSchema>;

export class InvalidPlannerDecisionError extends Error {}

function sourceMatchesScope(source: SourceConfig, input: QueryInput): boolean {
  return Object.keys(source.scope).every((key) => {
    const scopeKey = key as keyof QueryInput["scope"];
    const sourceValue = source.scope[scopeKey];
    const inputValue = input.scope[scopeKey];
    if (sourceValue === null || inputValue === null) return true;
    if (scopeKey === "campus") {
      const normalizeCampus = (value: string) =>
        value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
      const sourceCampus = normalizeCampus(sourceValue);
      const inputCampus = normalizeCampus(inputValue);
      const utsgAliases = new Set(["utsg", "stgeorge", "stgeorgeutsg"]);
      if (utsgAliases.has(sourceCampus) && utsgAliases.has(inputCampus)) return true;
    }
    return sourceValue === inputValue;
  });
}

function sourceMatchesMode(source: SourceConfig, input: QueryInput): boolean {
  if (input.mode === "LIVE_FIXTURE") return source.contentMode === "fixture";
  if (input.mode === "REPLAY") return source.contentMode === "cached";
  return source.contentMode !== "fixture";
}

export function materializePlannerDecision(
  runId: string,
  input: QueryInput,
  sources: SourceConfig[],
  candidate: unknown,
): QueryPlan | ClarificationPlan {
  const decision = PlannerDecisionSchema.parse(candidate);
  if (decision.decision === "clarify") {
    if (decision.question === null || decision.question.trim().length === 0) {
      throw new InvalidPlannerDecisionError("Clarification decision requires a question.");
    }
    if (decision.missingFields.length === 0) {
      throw new InvalidPlannerDecisionError("Clarification decision requires missing fields.");
    }
    return {
      question: decision.question,
      missingFields: [...new Set(decision.missingFields)],
    };
  }

  if (decision.sourceIds.length === 0 || decision.sourceIds.length > 3) {
    throw new InvalidPlannerDecisionError("Plan must select between one and three sources.");
  }
  if (decision.requestedFields.length === 0) {
    throw new InvalidPlannerDecisionError("Plan must request at least one answer field.");
  }

  const registry = new Map(sources.map((source) => [source.id, source]));
  const requestedByUser = input.sourceIds === undefined ? null : new Set(input.sourceIds);
  const targets = [...new Set(decision.sourceIds)].map((sourceId) => {
    const source = registry.get(sourceId);
    if (source === undefined) {
      throw new InvalidPlannerDecisionError(`Planner selected unknown source ${sourceId}.`);
    }
    if (requestedByUser !== null && !requestedByUser.has(sourceId)) {
      throw new InvalidPlannerDecisionError(`Planner selected source ${sourceId} outside the user's allowlist.`);
    }
    if (source.access === "unconfigured") {
      throw new InvalidPlannerDecisionError(`Planner selected unconfigured source ${sourceId}.`);
    }
    if (!sourceMatchesScope(source, input)) {
      throw new InvalidPlannerDecisionError(`Planner selected source ${sourceId} outside the query scope.`);
    }
    if (!sourceMatchesMode(source, input)) {
      throw new InvalidPlannerDecisionError(`Planner selected source ${sourceId} incompatible with ${input.mode}.`);
    }
    return source;
  });

  const requestedFields = new Set(decision.requestedFields);
  if (input.mode === "LIVE_WEB") {
    requestedFields.add("requirements");
    requestedFields.add("eligibility");
  }

  return {
    runId,
    input,
    targets,
    requestedFields: [...requestedFields],
    budget: { maxPages: 3, maxSteps: 6, timeoutMs: 90_000 },
  };
}

export interface OpenAiRunPlannerOptions {
  apiKey: string;
  model: string;
  client?: OpenAI;
}

export function createOpenAiRunPlanner({
  apiKey,
  model,
  client = new OpenAI({ apiKey }),
}: OpenAiRunPlannerOptions): RunPlanner {
  return async (runId, input, sources, signal) => {
    const sourceCatalog = sources.map(({ id, label, kind, scope, contentMode, access }) => ({
      id,
      label,
      kind,
      scope,
      contentMode,
      access,
    }));
    const response = await client.responses.parse(
      {
        model,
        store: false,
        instructions:
          "Route the campus question only to IDs in the supplied source catalog and select factual requested fields, not UI section names. Do not invent URLs or facts. Ask one concise clarification only when scope ambiguity prevents safe source selection.",
        input: JSON.stringify({ queryInput: input, sourceCatalog }),
        text: { format: zodTextFormat(PlannerDecisionSchema, "campus_query_plan") },
      },
      { signal },
    );
    if (response.output_parsed === null) {
      throw new InvalidPlannerDecisionError("OpenAI returned no parsed planning decision.");
    }
    return materializePlannerDecision(runId, input, sources, response.output_parsed);
  };
}
