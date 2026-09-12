import { randomUUID } from "node:crypto";

import {
  EventEnvelopeSchema,
  type AnswerBundle,
  type BrowserBatch,
  type ClarificationRequest,
  type EventEnvelope,
  type QueryInput,
  type RunSnapshot,
  type RunStatus,
} from "@allabout/contracts";

type RunSubscriber = (event: EventEnvelope) => void;

interface RunRecord {
  input: QueryInput;
  status: RunStatus;
  bundle: AnswerBundle | null;
  cleanup: BrowserBatch["cleanup"] | null;
  events: EventEnvelope[];
  subscribers: Set<RunSubscriber>;
  clarificationAnswer: string | null;
}

const terminalStatuses = new Set<RunStatus>([
  "completed",
  "partial",
  "failed",
  "cancelled",
]);

export class RunStore {
  private readonly runs = new Map<string, RunRecord>();
  private activeRunId: string | undefined;

  create(input: QueryInput): RunSnapshot {
    if (this.activeRunId !== undefined) {
      throw new ActiveRunConflictError(this.activeRunId);
    }

    const runId = `run-${randomUUID()}`;
    const record: RunRecord = {
      input: structuredClone(input),
      status: "queued",
      bundle: null,
      cleanup: null,
      events: [],
      subscribers: new Set(),
      clarificationAnswer: null,
    };
    this.runs.set(runId, record);
    this.activeRunId = runId;
    this.append(runId, "run_status", { status: "queued" });
    return this.toSnapshot(runId, record);
  }

  get(runId: string): RunSnapshot | undefined {
    const record = this.runs.get(runId);
    return record === undefined ? undefined : this.toSnapshot(runId, record);
  }

  cancel(runId: string): RunSnapshot | undefined {
    const record = this.runs.get(runId);
    if (record === undefined || terminalStatuses.has(record.status)) {
      return record === undefined ? undefined : this.toSnapshot(runId, record);
    }

    this.setStatus(runId, "cancelling");
    this.setStatus(runId, "cancelled");
    return this.toSnapshot(runId, record);
  }

  applyClarification(
    runId: string,
    clarification: ClarificationRequest,
  ): RunSnapshot | undefined {
    const record = this.runs.get(runId);
    if (record === undefined) {
      return undefined;
    }
    if (record.status !== "needs_input") {
      throw new InvalidRunStateError("needs_input", record.status);
    }

    record.input = { ...record.input, scope: structuredClone(clarification.scope) };
    record.clarificationAnswer = clarification.answer;
    this.setStatus(runId, "planning");
    return this.toSnapshot(runId, record);
  }

  setStatus(runId: string, status: RunStatus): RunSnapshot | undefined {
    const record = this.runs.get(runId);
    if (record === undefined) {
      return undefined;
    }

    record.status = status;
    this.append(runId, "run_status", { status });
    if (terminalStatuses.has(status) && this.activeRunId === runId) {
      this.activeRunId = undefined;
    }
    return this.toSnapshot(runId, record);
  }

  subscribeAfter(
    runId: string,
    afterSequence: number,
    subscriber: RunSubscriber,
  ): { events: EventEnvelope[]; unsubscribe: () => void } | undefined {
    const record = this.runs.get(runId);
    if (record === undefined) {
      return undefined;
    }

    record.subscribers.add(subscriber);
    const events = record.events
      .filter((event) => event.seq > afterSequence)
      .map((event) => structuredClone(event));
    let subscribed = true;
    return {
      events,
      unsubscribe: () => {
        if (subscribed) {
          record.subscribers.delete(subscriber);
          subscribed = false;
        }
      },
    };
  }

  private append(
    runId: string,
    type: EventEnvelope["type"],
    payload: unknown,
  ): void {
    const record = this.runs.get(runId);
    if (record === undefined) {
      throw new Error(`Cannot append an event to unknown run ${runId}.`);
    }
    const event = EventEnvelopeSchema.parse({
      schemaVersion: "1",
      runId,
      seq: record.events.length + 1,
      at: new Date().toISOString(),
      type,
      payload,
    });
    record.events.push(event);
    for (const subscriber of record.subscribers) {
      subscriber(structuredClone(event));
    }
  }

  private toSnapshot(runId: string, record: RunRecord): RunSnapshot {
    return {
      runId,
      input: structuredClone(record.input),
      status: record.status,
      bundle: record.bundle,
      lastEventSeq: record.events.length,
      cleanup: record.cleanup,
    };
  }
}

export class ActiveRunConflictError extends Error {
  constructor(readonly activeRunId: string) {
    super(`Run ${activeRunId} is still active.`);
    this.name = "ActiveRunConflictError";
  }
}

export class InvalidRunStateError extends Error {
  constructor(
    readonly expected: RunStatus,
    readonly actual: RunStatus,
  ) {
    super(`Run must be ${expected}, but is ${actual}.`);
    this.name = "InvalidRunStateError";
  }
}
