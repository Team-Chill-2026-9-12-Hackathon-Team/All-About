import { collectPages as collectWithSteel } from "@allabout/browser";
import type {
  BuildAnswer,
  CollectPages,
  SourceConfig,
} from "@allabout/contracts";
import { buildAnswer as buildWithEvidence } from "@allabout/evidence";

import { createOpenAiRunPlanner } from "./openai-planner.js";
import { createDefaultPlan, RunExecutor, type RunPlanner } from "./run-executor.js";
import { RunStore } from "./run-store.js";
import type { VaultStore } from "./vault-store.js";

export interface RuntimeOptions {
  sources: SourceConfig[];
  apiKey?: string;
  model?: string;
  runStore?: RunStore;
  planRun?: RunPlanner;
  collectPages?: CollectPages;
  buildAnswer?: BuildAnswer;
  vaultStore?: VaultStore;
}

export interface RunRuntime {
  sources: SourceConfig[];
  runStore: RunStore;
  runExecutor: RunExecutor;
  vaultStore?: VaultStore;
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
      collectWithSteel(plan, emit, signal, {
        credentials: options.vaultStore?.secretsForHosts(
          plan.targets.flatMap((target) => target.allowedHosts),
        ) ?? [],
      }));
  return {
    sources: options.sources,
    runStore,
    ...(options.vaultStore ? { vaultStore: options.vaultStore } : {}),
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
    throw new Error(
      "OPENAI_API_KEY and OPENAI_MODEL are required when no planner override is provided.",
    );
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
