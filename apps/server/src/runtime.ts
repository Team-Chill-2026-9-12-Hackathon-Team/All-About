import { collectPages as collectWithSteel, type CredentialResolver } from "@allabout/browser";
import type {
  BrowserBatch,
  BrowserEmitter,
  BuildAnswer,
  CollectPages,
  SourceConfig,
  QueryPlan,
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
    createFixtureAwareCollector(runStore, (plan, emit, signal) =>
      collectWithSteel(plan, emit, signal, options.resolveCredential));
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

export function createFixtureAwareCollector(
  runStore: RunStore,
  collectLive: (plan: QueryPlan, emit: BrowserEmitter, signal: AbortSignal) => Promise<BrowserBatch>,
): CollectPages {
  return async (plan, emit, signal) => {
      if (shouldCollectFixtures(plan)) return collectFixturePages(plan, emit, signal);
      if (plan.input.mode !== "LIVE_FIXTURE") {
        return collectLive(plan, emit, signal);
      }
      try {
        const live = await collectLive(plan, emit, signal);
        if (live.pages.length > 0) return live;
      } catch (error) {
        if (signal.aborted) throw error;
      }
      const localPlan = {
        ...plan,
        input: {...plan.input, mode: "LOCAL_FIXTURE" as const},
      };
      runStore.setMode(plan.runId, "LOCAL_FIXTURE");
      Object.assign(plan, localPlan);
      const first = plan.targets[0];
      if (first) emit({ type: "step", sourceId: first.id, action: "local_fixture_fallback" });
      return collectFixturePages(localPlan, emit, signal);
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
