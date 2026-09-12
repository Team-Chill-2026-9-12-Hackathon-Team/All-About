import {
  QueryPlanSchema,
  type BrowserSignal,
  type BuildAnswer,
  type CollectPages,
  type QueryPlan,
  type RunStatus,
  type SourceConfig,
} from "@allabout/contracts";

import { isTerminalRunStatus, RunStore } from "./run-store.js";

export interface RunExecutorDependencies {
  runStore: RunStore;
  sources: SourceConfig[];
  collectPages: CollectPages;
  buildAnswer: BuildAnswer;
}

export class RunExecutor {
  readonly #runStore: RunStore;
  readonly #sources: SourceConfig[];
  readonly #collectPages: CollectPages;
  readonly #buildAnswer: BuildAnswer;
  readonly #controllers = new Map<string, AbortController>();

  constructor(dependencies: RunExecutorDependencies) {
    this.#runStore = dependencies.runStore;
    this.#sources = dependencies.sources;
    this.#collectPages = dependencies.collectPages;
    this.#buildAnswer = dependencies.buildAnswer;
  }

  start(runId: string): void {
    if (this.#controllers.has(runId)) return;
    const controller = new AbortController();
    this.#controllers.set(runId, controller);
    void this.#execute(runId, controller).finally(() => {
      this.#controllers.delete(runId);
    });
  }

  cancel(runId: string) {
    this.#controllers.get(runId)?.abort();
    return this.#runStore.cancel(runId);
  }

  async #execute(runId: string, controller: AbortController): Promise<void> {
    let errorCode: "NAVIGATION_FAILED" | "MODEL_FAILED" = "NAVIGATION_FAILED";
    try {
      this.#runStore.transition(runId, "planning");
      const plan = this.#createPlan(runId);
      if (!this.#isWritable(runId)) return;

      this.#runStore.transition(runId, "browsing");
      const batch = await this.#collectPages(
        plan,
        (signal) => this.#mapBrowserSignal(runId, signal),
        controller.signal,
      );
      if (!this.#isWritable(runId)) return;

      this.#runStore.appendEvent(runId, "viewer_closed", {
        reason:
          batch.cleanup === "released"
            ? "released"
            : batch.cleanup === "release_failed"
              ? "failed"
              : "unavailable",
      });
      this.#runStore.transition(runId, "synthesizing");
      errorCode = "MODEL_FAILED";
      const answer = await this.#buildAnswer(plan, batch, controller.signal);
      if (!this.#isWritable(runId)) return;

      this.#runStore.setAnswer(runId, answer);
      const finalStatus: RunStatus =
        batch.failures.length > 0 || answer.unknowns.length > 0
          ? "partial"
          : "completed";
      this.#runStore.transition(runId, finalStatus);
    } catch (error) {
      if (!this.#isWritable(runId)) return;
      this.#runStore.appendEvent(runId, "run_error", {
        code: errorCode,
        message: error instanceof Error ? error.message : "Run execution failed.",
        retryable: false,
      });
      this.#runStore.transition(runId, "failed");
    }
  }

  #createPlan(runId: string): QueryPlan {
    const input = this.#runStore.getInput(runId);
    const requestedIds = input.sourceIds === undefined ? null : new Set(input.sourceIds);
    const targets = this.#sources
      .filter((source) => requestedIds === null || requestedIds.has(source.id))
      .slice(0, 3);

    return QueryPlanSchema.parse({
      runId,
      input,
      targets,
      requestedFields: ["summary", "requirements", "communityNotes", "keyDates"],
      budget: { maxPages: 3, maxSteps: 6, timeoutMs: 90_000 },
    });
  }

  #mapBrowserSignal(runId: string, signal: BrowserSignal): void {
    if (!this.#isWritable(runId)) return;
    switch (signal.type) {
      case "session_ready":
        this.#runStore.appendEvent(runId, "viewer_ready", {
          viewerUrl: signal.viewerUrl,
          interactive: false,
        });
        break;
      case "step":
        this.#runStore.appendEvent(runId, "browser_step", {
          sourceId: signal.sourceId,
          action: signal.action,
          ...(signal.url === undefined ? {} : { url: signal.url }),
        });
        break;
      case "page_read":
        this.#runStore.appendEvent(runId, "source_checked", {
          sourceId: signal.snapshot.sourceId,
          snapshotId: signal.snapshot.id,
          title: signal.snapshot.title,
          url: signal.snapshot.url,
        });
        break;
      case "source_failed":
        this.#runStore.appendEvent(runId, "source_failed", signal.failure);
        break;
    }
  }

  #isWritable(runId: string): boolean {
    return !isTerminalRunStatus(this.#runStore.getSnapshot(runId).status);
  }
}
