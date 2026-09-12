import {
  ApiErrorSchema,
  CancelRunResponseSchema,
  ClarificationRequestSchema,
  CreateRunResponseSchema,
  QueryInputSchema,
  RunSnapshotSchema,
  SourcesResponseSchema,
  type EventEnvelope,
  type Scope,
  type SourceConfig,
} from "@allabout/contracts";
import type { FastifyInstance, FastifyReply } from "fastify";

import {
  ActiveRunConflictError,
  InvalidEventCursorError,
  InvalidRunTransitionError,
  isTerminalRunStatus,
  RunNotFoundError,
  type RunStore,
} from "./run-store.js";

interface RunRoutesDependencies {
  runStore: RunStore;
  sources: SourceConfig[];
}

function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
) {
  return reply.code(statusCode).send(
    ApiErrorSchema.parse({
      error: { code, message },
    }),
  );
}

function getRunId(params: unknown): string | null {
  if (
    typeof params !== "object" ||
    params === null ||
    !("id" in params) ||
    typeof params.id !== "string" ||
    params.id.trim().length === 0
  ) {
    return null;
  }
  return params.id;
}

function parseLastEventId(
  runId: string,
  header: string | string[] | undefined,
): number | null {
  if (header === undefined) {
    return 0;
  }
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined) {
    return null;
  }
  const separator = value.lastIndexOf(":");
  if (separator < 1 || value.slice(0, separator) !== runId) {
    return null;
  }
  const sequence = Number(value.slice(separator + 1));
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : null;
}

function serializeSse(event: EventEnvelope): string {
  return `id: ${event.runId}:${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function isTerminalEvent(event: EventEnvelope): boolean {
  return (
    event.type === "run_status" &&
    isTerminalRunStatus(event.payload.status)
  );
}

function removeUndefinedScopeValues(
  scopePatch: Record<string, string | null | undefined>,
): Partial<Scope> {
  return Object.fromEntries(
    Object.entries(scopePatch).filter(([, value]) => value !== undefined),
  ) as Partial<Scope>;
}

export function registerRunRoutes(
  app: FastifyInstance,
  { runStore, sources }: RunRoutesDependencies,
): void {
  app.get("/api/sources", async () =>
    SourcesResponseSchema.parse(
      sources.map(({ id, label, kind, access }) => ({ id, label, kind, access })),
    ),
  );

  app.post<{ Body: unknown }>("/api/runs", async (request, reply) => {
    const parsedInput = QueryInputSchema.safeParse(request.body);
    if (!parsedInput.success) {
      return sendError(
        reply,
        400,
        "INVALID_QUERY_INPUT",
        "The query input does not match the shared contract.",
      );
    }

    try {
      const run = runStore.create(parsedInput.data);
      return reply.code(202).send(
        CreateRunResponseSchema.parse({
          runId: run.runId,
          eventsUrl: `/api/runs/${run.runId}/events`,
          status: "queued",
        }),
      );
    } catch (error) {
      if (error instanceof ActiveRunConflictError) {
        return sendError(
          reply,
          409,
          "ACTIVE_RUN_CONFLICT",
          "Another run is still active.",
        );
      }
      throw error;
    }
  });

  app.get<{ Params: { id: string } }>("/api/runs/:id", async (request, reply) => {
    const runId = getRunId(request.params);
    if (runId === null) {
      return sendError(reply, 400, "INVALID_RUN_ID", "A run ID is required.");
    }
    try {
      return RunSnapshotSchema.parse(runStore.getSnapshot(runId));
    } catch (error) {
      if (error instanceof RunNotFoundError) {
        return sendError(reply, 404, "RUN_NOT_FOUND", "Run not found.");
      }
      throw error;
    }
  });

  app.post<{ Params: { id: string }; Body: unknown }>(
    "/api/runs/:id/clarification",
    async (request, reply) => {
      const runId = getRunId(request.params);
      if (runId === null) {
        return sendError(reply, 400, "INVALID_RUN_ID", "A run ID is required.");
      }
      const parsedBody = ClarificationRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return sendError(
          reply,
          400,
          "INVALID_CLARIFICATION",
          "The clarification does not match the shared contract.",
        );
      }

      try {
        return RunSnapshotSchema.parse(
          runStore.applyClarification(
            runId,
            removeUndefinedScopeValues(parsedBody.data.scopePatch),
            parsedBody.data.answer,
          ),
        );
      } catch (error) {
        if (error instanceof RunNotFoundError) {
          return sendError(reply, 404, "RUN_NOT_FOUND", "Run not found.");
        }
        if (error instanceof InvalidRunTransitionError) {
          return sendError(
            reply,
            409,
            "RUN_STATE_CONFLICT",
            "This run is not waiting for clarification.",
          );
        }
        throw error;
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/runs/:id/cancel",
    async (request, reply) => {
      const runId = getRunId(request.params);
      if (runId === null) {
        return sendError(reply, 400, "INVALID_RUN_ID", "A run ID is required.");
      }
      try {
        const run = runStore.cancel(runId);
        return reply.code(202).send(
          CancelRunResponseSchema.parse({ runId: run.runId, status: run.status }),
        );
      } catch (error) {
        if (error instanceof RunNotFoundError) {
          return sendError(reply, 404, "RUN_NOT_FOUND", "Run not found.");
        }
        throw error;
      }
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/runs/:id/events",
    async (request, reply) => {
      const runId = getRunId(request.params);
      if (runId === null) {
        return sendError(reply, 400, "INVALID_RUN_ID", "A run ID is required.");
      }
      if (!runStore.has(runId)) {
        return sendError(reply, 404, "RUN_NOT_FOUND", "Run not found.");
      }

      const afterSeq = parseLastEventId(runId, request.headers["last-event-id"]);
      if (afterSeq === null) {
        return sendError(
          reply,
          400,
          "INVALID_EVENT_CURSOR",
          "Last-Event-ID must match this run and use runId:seq format.",
        );
      }

      let unsubscribe: () => void = () => undefined;
      let streamClosed = false;
      const closeStream = () => {
        if (streamClosed) return;
        streamClosed = true;
        unsubscribe();
        reply.raw.end();
      };
      const sendEvent = (event: EventEnvelope) => {
        if (streamClosed) return;
        reply.raw.write(serializeSse(event));
        if (isTerminalEvent(event)) {
          closeStream();
        }
      };

      try {
        const subscription = runStore.openEventStream(runId, afterSeq, sendEvent);
        unsubscribe = subscription.unsubscribe;
        reply.hijack();
        reply.raw.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
        });
        request.raw.once("close", unsubscribe);
        for (const event of subscription.replay) {
          sendEvent(event);
        }
        if (subscription.terminal && !streamClosed) {
          closeStream();
        }
        return reply;
      } catch (error) {
        unsubscribe();
        if (error instanceof InvalidEventCursorError) {
          return sendError(
            reply,
            409,
            "EVENT_CURSOR_AHEAD",
            "Last-Event-ID is ahead of the stored event sequence.",
          );
        }
        if (error instanceof RunNotFoundError) {
          return sendError(reply, 404, "RUN_NOT_FOUND", "Run not found.");
        }
        throw error;
      }
    },
  );
}
