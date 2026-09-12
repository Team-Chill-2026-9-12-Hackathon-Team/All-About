import {
  AnswerBundleSchema,
  EventEnvelopeSchema,
  type AnswerBundle,
  type CleanupState,
  type EventEnvelope,
  type QueryInput,
  type RunSnapshot,
  type RunStatus,
  type Scope,
} from "@allabout/contracts";
import { randomUUID } from "node:crypto";

type EventType = EventEnvelope["type"];
type EventFor<TType extends EventType> = Extract<
  EventEnvelope,
  { type: TType }
>;
type EventPayload<TType extends EventType> = EventFor<TType>["payload"];
type EventListener = (event: EventEnvelope) => void;

const terminalStatuses = new Set<RunStatus>([
  "completed",
  "partial",
  "failed",
  "cancelled",
]);

export function isTerminalRunStatus(status: RunStatus): boolean {
  return terminalStatuses.has(status);
}

const allowedTransitions: Record<RunStatus, ReadonlySet<RunStatus>> = {
  queued: new Set(["planning", "cancelling"]),
  planning: new Set(["needs_input", "browsing", "failed", "cancelling"]),
  needs_input: new Set(["planning", "failed", "cancelling"]),
  browsing: new Set(["synthesizing", "partial", "failed", "cancelling"]),
  synthesizing: new Set(["completed", "partial", "failed", "cancelling"]),
  completed: new Set(),
  partial: new Set(),
  failed: new Set(),
  cancelling: new Set(["cancelled"]),
  cancelled: new Set(),
};

interface RunRecord {
  runId: string;
  input: QueryInput;
  status: RunStatus;
  answer: AnswerBundle | null;
  events: EventEnvelope[];
  clarificationAnswer: string | null;
  cleanup: CleanupState | null;
}

export class RunNotFoundError extends Error {
  constructor(readonly runId: string) {
    super(`Run ${runId} was not found.`);
  }
}

export class ActiveRunConflictError extends Error {
  constructor(readonly runId: string) {
    super(`Run ${runId} is still active.`);
  }
}

export class InvalidRunTransitionError extends Error {
  constructor(
    readonly runId: string,
    readonly from: RunStatus,
    readonly to: RunStatus,
  ) {
    super(`Run ${runId} cannot transition from ${from} to ${to}.`);
  }
}

export class InvalidEventCursorError extends Error {
  constructor(
    readonly runId: string,
    readonly afterSeq: number,
    readonly lastSeq: number,
  ) {
    super(`Cursor ${afterSeq} is ahead of run ${runId} at ${lastSeq}.`);
  }
}

export interface RunStoreOptions {
  createId?: () => string;
  now?: () => Date;
}

export interface EventStreamSubscription {
  replay: EventEnvelope[];
  terminal: boolean;
  unsubscribe: () => void;
}

export class RunStore {
  readonly #runs = new Map<string, RunRecord>();
  readonly #listeners = new Map<string, Set<EventListener>>();
  readonly #createId: () => string;
  readonly #now: () => Date;

  constructor(options: RunStoreOptions = {}) {
    this.#createId = options.createId ?? randomUUID;
    this.#now = options.now ?? (() => new Date());
  }

  create(input: QueryInput): RunSnapshot {
    const activeRun = [...this.#runs.values()].find(
      (run) => !isTerminalRunStatus(run.status),
    );
    if (activeRun) {
      throw new ActiveRunConflictError(activeRun.runId);
    }

    const runId = this.#createId();
    const record: RunRecord = {
      runId,
      input: structuredClone(input),
      status: "queued",
      answer: null,
      events: [],
      clarificationAnswer: null,
      cleanup: null,
    };
    this.#runs.set(runId, record);
    this.#append(record, "run_status", { status: "queued" });
    return this.getSnapshot(runId);
  }

  has(runId: string): boolean {
    return this.#runs.has(runId);
  }

  getSnapshot(runId: string): RunSnapshot {
    const record = this.#require(runId);
    return {
      runId: record.runId,
      status: record.status,
      answer: record.answer === null ? null : structuredClone(record.answer),
      lastSeq: record.events.length,
      cleanup: record.cleanup,
      viewerUrl: liveViewerUrl(record),
    };
  }

  getInput(runId: string): QueryInput {
    return structuredClone(this.#require(runId).input);
  }

  getClarificationAnswer(runId: string): string | null {
    return this.#require(runId).clarificationAnswer;
  }

  transition(runId: string, nextStatus: RunStatus): RunSnapshot {
    const record = this.#require(runId);
    if (record.status === nextStatus) {
      return this.getSnapshot(runId);
    }
    if (!allowedTransitions[record.status].has(nextStatus)) {
      throw new InvalidRunTransitionError(runId, record.status, nextStatus);
    }
    record.status = nextStatus;
    this.#append(record, "run_status", { status: nextStatus });
    return this.getSnapshot(runId);
  }

  setAnswer(runId: string, answer: AnswerBundle): RunSnapshot {
    const record = this.#require(runId);
    record.answer = AnswerBundleSchema.parse(answer);
    this.#append(record, "answer_ready", record.answer);
    return this.getSnapshot(runId);
  }

  setCleanup(runId: string, cleanup: CleanupState): RunSnapshot {
    const record = this.#require(runId);
    record.cleanup = cleanup;
    return this.getSnapshot(runId);
  }

  applyClarification(
    runId: string,
    scopePatch: Partial<Scope>,
    answer: string,
  ): RunSnapshot {
    const record = this.#require(runId);
    if (record.status !== "needs_input") {
      throw new InvalidRunTransitionError(runId, record.status, "planning");
    }
    record.input = {
      ...record.input,
      scope: { ...record.input.scope, ...scopePatch },
    };
    record.clarificationAnswer = answer;
    return this.transition(runId, "planning");
  }

  cancel(runId: string): RunSnapshot {
    const record = this.#require(runId);
    if (isTerminalRunStatus(record.status)) {
      return this.getSnapshot(runId);
    }
    if (record.status !== "cancelling") {
      this.transition(runId, "cancelling");
    }
    return this.transition(runId, "cancelled");
  }

  appendEvent<TType extends Exclude<EventType, "run_status" | "answer_ready">>(
    runId: string,
    type: TType,
    payload: EventPayload<TType>,
  ): EventFor<TType> {
    return this.#append(this.#require(runId), type, payload);
  }

  openEventStream(
    runId: string,
    afterSeq: number,
    listener: EventListener,
  ): EventStreamSubscription {
    const record = this.#require(runId);
    const lastSeq = record.events.length;
    if (!Number.isInteger(afterSeq) || afterSeq < 0 || afterSeq > lastSeq) {
      throw new InvalidEventCursorError(runId, afterSeq, lastSeq);
    }

    const terminal = isTerminalRunStatus(record.status);
    const listeners = this.#listeners.get(runId) ?? new Set<EventListener>();
    if (!terminal) {
      listeners.add(listener);
      this.#listeners.set(runId, listeners);
    }

    const viewerClosed = record.events.some((event) => event.type === "viewer_closed");
    const replay = record.events
      .slice(afterSeq)
      .filter((event) => !viewerClosed || event.type !== "viewer_ready");

    return {
      replay: structuredClone(replay),
      terminal,
      unsubscribe: () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.#listeners.delete(runId);
        }
      },
    };
  }

  #require(runId: string): RunRecord {
    const record = this.#runs.get(runId);
    if (!record) {
      throw new RunNotFoundError(runId);
    }
    return record;
  }

  #append<TType extends EventType>(
    record: RunRecord,
    type: TType,
    payload: EventPayload<TType>,
  ): EventFor<TType> {
    const event = EventEnvelopeSchema.parse({
      schemaVersion: "1",
      runId: record.runId,
      seq: record.events.length + 1,
      at: this.#now().toISOString(),
      type,
      payload,
    }) as EventFor<TType>;
    record.events.push(event);
    for (const listener of this.#listeners.get(record.runId) ?? []) {
      listener(structuredClone(event));
    }
    return structuredClone(event);
  }
}

function liveViewerUrl(record: RunRecord): string | null {
  let viewerUrl: string | null = null;
  for (const event of record.events) {
    if (event.type === "viewer_ready") {
      viewerUrl = event.payload.viewerUrl;
    }
    if (event.type === "viewer_closed") {
      viewerUrl = null;
    }
  }
  return viewerUrl;
}
