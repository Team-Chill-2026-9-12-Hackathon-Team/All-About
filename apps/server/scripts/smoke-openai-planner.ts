import type { QueryInput, SourceConfig } from "@allabout/contracts";

import { loadRootEnvironment, readServerConfig } from "../src/config.js";
import { createOpenAiRunPlanner } from "../src/openai-planner.js";

loadRootEnvironment();
const config = readServerConfig();
if (config.openAiApiKey === undefined || config.openAiModel === undefined) {
  throw new Error("OPENAI_API_KEY and OPENAI_MODEL are required for this smoke test.");
}

const scope: QueryInput["scope"] = {
  school: "University of Toronto",
  campus: "St. George (UTSG)",
  term: "Fall 2026",
  course: null,
  section: null,
  entity: "Synthetic smoke-test registration page",
};
const input: QueryInput = {
  query: "Summarize the synthetic registration page for this scope.",
  scope,
  sourceIds: ["synthetic-smoke-source"],
  mode: "LIVE_WEB",
};
const source: SourceConfig = {
  id: "synthetic-smoke-source",
  label: "Synthetic smoke-test source",
  kind: "official",
  entryUrl: "https://example.test/synthetic-smoke",
  allowedHosts: ["example.test"],
  scope,
  contentMode: "live",
  access: "public",
};

const planner = createOpenAiRunPlanner({
  apiKey: config.openAiApiKey,
  model: config.openAiModel,
});
const result = await planner(
  "smoke-run",
  input,
  [source],
  AbortSignal.timeout(30_000),
);

console.log(
  JSON.stringify({
    model: config.openAiModel,
    decision: "question" in result ? "clarify" : "plan",
    selectedSourceIds:
      "question" in result ? [] : result.targets.map(({ id }) => id),
  }),
);
