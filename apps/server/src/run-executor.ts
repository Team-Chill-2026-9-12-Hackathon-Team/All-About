import {
  QueryPlanSchema,
  type BrowserSignal,
  type BuildAnswer,
  type CollectPages,
  type QueryInput,
  type QueryPlan,
  type RunStatus,
  type SourceConfig,
} from "@allabout/contracts";

import { validateAnswerBundle } from "./answer-validator.js";
import { isTerminalRunStatus, RunStore } from "./run-store.js";

export interface RunExecutorDependencies {
  runStore: RunStore;
  sources: SourceConfig[];
  collectPages: CollectPages;
  buildAnswer: BuildAnswer;
  planRun?: RunPlanner;
  timeoutMs?: number;
  clarificationTimeoutMs?: number;
}

export interface ClarificationPlan {
  question: string;
  missingFields: string[];
}

export type RunPlanner = (
  runId: string,
  input: QueryInput,
  sources: SourceConfig[],
) => QueryPlan | ClarificationPlan;

class ExecutionTimeoutError extends Error {
  constructor() {
    super("Run exceeded its active processing time budget.");
  }
}

export class RunExecutor {
  readonly #runStore: RunStore;
  readonly #sources: SourceConfig[];
  readonly #collectPages: CollectPages;
  readonly #buildAnswer: BuildAnswer;
  readonly #planRun: RunPlanner;
  readonly #timeoutMs: number;
  readonly #clarificationTimeoutMs: number;
  readonly #controllers = new Map<string, AbortController>();
  readonly #clarificationTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(dependencies: RunExecutorDependencies) {
    this.#runStore = dependencies.runStore;
    this.#sources = dependencies.sources;
    this.#collectPages = dependencies.collectPages;
    this.#buildAnswer = dependencies.buildAnswer;
    this.#planRun = dependencies.planRun ?? ((runId, input, sources) =>
      this.#createDefaultPlan(runId, input, sources));
    this.#timeoutMs = dependencies.timeoutMs ?? 90_000;
    this.#clarificationTimeoutMs = dependencies.clarificationTimeoutMs ?? 300_000;
  }

  start(runId: string): void {
    if (this.#controllers.has(runId)) return;
    const status = this.#runStore.getSnapshot(runId).status;
    if (status !== "queued" && status !== "planning") return;
    this.#clearClarificationTimer(runId);
    const controller = new AbortController();
    this.#controllers.set(runId, controller);
    void this.#execute(runId, controller).finally(() => {
      this.#controllers.delete(runId);
    });
  }

  cancel(runId: string) {
    this.#clearClarificationTimer(runId);
    this.#controllers.get(runId)?.abort();
    return this.#runStore.cancel(runId);
  }

  async #execute(runId: string, controller: AbortController): Promise<void> {
    let errorCode: "NAVIGATION_FAILED" | "MODEL_FAILED" = "MODEL_FAILED";
    const timeout = setTimeout(
      () => controller.abort(new ExecutionTimeoutError()),
      this.#timeoutMs,
    );
    try {
      this.#runStore.transition(runId, "planning");
      const input = this.#runStore.getInput(runId);
      const planningResult = this.#planRun(runId, input, this.#sources);
      if ("question" in planningResult) {
        this.#runStore.transition(runId, "needs_input");
        this.#runStore.appendEvent(runId, "clarification_needed", planningResult);
        this.#scheduleClarificationTimeout(runId);
        return;
      }
      const plan = QueryPlanSchema.parse(planningResult);
      if (!this.#isWritable(runId)) return;

      this.#runStore.transition(runId, "browsing");
      errorCode = "NAVIGATION_FAILED";
      const batch = await this.#withAbort(
        this.#collectPages(
          plan,
          (signal) => this.#mapBrowserSignal(runId, signal),
          controller.signal,
        ),
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
      const candidateAnswer = await this.#withAbort(
        this.#buildAnswer(plan, batch, controller.signal),
        controller.signal,
      );
      if (!this.#isWritable(runId)) return;

      const answer = validateAnswerBundle(plan, batch, candidateAnswer);
      this.#runStore.setAnswer(runId, answer);
      const finalStatus: RunStatus =
        batch.failures.length > 0 || answer.unknowns.length > 0
          ? "partial"
          : "completed";
      this.#runStore.transition(runId, finalStatus);
    } catch (error) {
      if (!this.#isWritable(runId)) return;
      const timedOut = error instanceof ExecutionTimeoutError;
      this.#runStore.appendEvent(runId, "run_error", {
        code: timedOut ? "TIMEOUT" : errorCode,
        message: error instanceof Error ? error.message : "Run execution failed.",
        retryable: timedOut,
      });
      this.#runStore.transition(runId, "failed");
    } finally {
      clearTimeout(timeout);
    }
  }

  #createDefaultPlan(
    runId: string,
    input: QueryInput,
    sources: SourceConfig[],
  ): QueryPlan {
    const requestedIds = input.sourceIds === undefined ? null : new Set(input.sourceIds);
    const targets = sources
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

  #withAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise<T>((resolve, reject) => {
      const onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      promise.then(
        (value) => {
          signal.removeEventListener("abort", onAbort);
          resolve(value);
        },
        (error: unknown) => {
          signal.removeEventListener("abort", onAbort);
          reject(error);
        },
      );
    });
  }

  #scheduleClarificationTimeout(runId: string): void {
    this.#clearClarificationTimer(runId);
    const timer = setTimeout(() => {
      this.#clarificationTimers.delete(runId);
      if (this.#runStore.getSnapshot(runId).status !== "needs_input") return;
      this.#runStore.appendEvent(runId, "run_error", {
        code: "TIMEOUT",
        message: "Clarification was not received before the waiting deadline.",
        retryable: true,
      });
      this.#runStore.transition(runId, "failed");
    }, this.#clarificationTimeoutMs);
    this.#clarificationTimers.set(runId, timer);
  }

  #clearClarificationTimer(runId: string): void {
    const timer = this.#clarificationTimers.get(runId);
    if (timer !== undefined) clearTimeout(timer);
    this.#clarificationTimers.delete(runId);
  }
}
