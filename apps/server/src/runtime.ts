import { collectPages as collectWithSteel } from "@allabout/browser";
import type {
  BuildAnswer,
  CollectPages,
  SourceConfig,
} from "@allabout/contracts";
import { buildAnswer as buildWithEvidence } from "@allabout/evidence";

import { createOpenAiRunPlanner } from "./openai-planner.js";
import { RunExecutor, type RunPlanner } from "./run-executor.js";
import { RunStore } from "./run-store.js";

export interface RuntimeOptions {
  sources: SourceConfig[];
  apiKey?: string;
  model?: string;
  runStore?: RunStore;
  planRun?: RunPlanner;
  collectPages?: CollectPages;
  buildAnswer?: BuildAnswer;
}

export interface RunRuntime {
  sources: SourceConfig[];
  runStore: RunStore;
  runExecutor: RunExecutor;
}

export function createRunRuntime(options: RuntimeOptions): RunRuntime {
  if (options.sources.length === 0) {
    throw new Error("At least one source is required to configure run execution.");
  }
  const planRun = options.planRun ?? createConfiguredOpenAiPlanner(options);
  const runStore = options.runStore ?? new RunStore();
  return {
    sources: options.sources,
    runStore,
    runExecutor: new RunExecutor({
      runStore,
      sources: options.sources,
      planRun,
      collectPages: options.collectPages ?? collectWithSteel,
      buildAnswer: options.buildAnswer ?? buildWithEvidence,
    }),
  };
}

function createConfiguredOpenAiPlanner(options: RuntimeOptions): RunPlanner {
  if (options.apiKey === undefined || options.model === undefined) {
    throw new Error(
      "OPENAI_API_KEY and OPENAI_MODEL are required when no planner override is provided.",
    );
  }
  return createOpenAiRunPlanner({ apiKey: options.apiKey, model: options.model });
}
