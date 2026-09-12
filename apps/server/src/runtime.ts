import { collectPages as collectWithSteel, type CredentialResolver } from "@allabout/browser";
import type {
  BuildAnswer,
  CollectPages,
  SourceConfig,
} from "@allabout/contracts";
import { buildAnswer as buildWithEvidence } from "@allabout/evidence";

import { collectFixturePages, shouldCollectFixtures } from "./fixture-collect.js";
import { createOpenAiRunPlanner } from "./openai-planner.js";
import { createDefaultPlan, RunExecutor, type RunPlanner } from "./run-executor.js";
import { RunStore } from "./run-store.js";

export interface RuntimeOptions {
  sources: SourceConfig[];
  apiKey?: string;
  model?: string;
  runStore?: RunStore;
  planRun?: RunPlanner;
  collectPages?: CollectPages;
  buildAnswer?: BuildAnswer;
  resolveCredential?: CredentialResolver;
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
  const collectPages =
    options.collectPages ??
    ((plan, emit, signal) =>
      shouldCollectFixtures(plan)
        ? collectFixturePages(plan, emit, signal)
        : collectWithSteel(plan, emit, signal, options.resolveCredential));
  return {
    sources: options.sources,
    runStore,
    runExecutor: new RunExecutor({
      runStore,
      sources: options.sources,
      planRun,
      collectPages,
      buildAnswer: options.buildAnswer ?? buildWithEvidence,
    }),
  };
}

function createConfiguredOpenAiPlanner(options: RuntimeOptions): RunPlanner {
  if (options.apiKey === undefined || options.model === undefined) {
    return (runId, input, sources) => createDefaultPlan(runId, input, sources);
  }
  const openai = createOpenAiRunPlanner({ apiKey: options.apiKey, model: options.model });
  return async (runId, input, sources, signal) => {
    if (input.sourceIds !== undefined && input.sourceIds.length > 0) {
      return createDefaultPlan(runId, input, sources);
    }
    try {
      return await openai(runId, input, sources, signal);
    } catch (error) {
      if (signal.aborted) throw error;
      return createDefaultPlan(runId, input, sources);
    }
  };
}
