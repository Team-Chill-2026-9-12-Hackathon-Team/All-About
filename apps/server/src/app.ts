import Fastify, { type FastifyServerOptions } from "fastify";
import { collectPages as collectWithSteel } from "@allabout/browser";
import {
  ClarificationRequestSchema,
  CreateRunResponseSchema,
  QueryPlanSchema,
  QueryInputSchema,
  SseEventIdSchema,
  type BrowserSignal,
  type CollectPages,
  type EventEnvelope,
  type SourceSummary,
} from "@allabout/contracts";

import {
  ActiveRunConflictError,
  InvalidRunStateError,
  RunStore,
} from "./run-store.js";

interface AppDependencies {
  collectPages?: CollectPages;
  runStore?: RunStore;
}

const sources: SourceSummary[] = [
  {
    id: "academic-calendar",
    label: "U of T Academic Calendar",
    kind: "official",
    access: "public",
  },
  {
    id: "uoft-events",
    label: "University of Toronto Events",
    kind: "official",
    access: "public",
  },
];

export function buildApp(
  options: FastifyServerOptions = {},
  dependencies: AppDependencies = {},
) {
  const app = Fastify(options);
  const collectPages = dependencies.collectPages ?? collectWithSteel;
  const runStore = dependencies.runStore ?? new RunStore();

  app.get("/api/health", async () => ({ ok: true as const }));
  app.get("/api/sources", async () => ({ sources }));

  app.post("/api/browser/collect", async (request, reply) => {
    const parsed = QueryPlanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "INVALID_QUERY_PLAN",
        details: parsed.error.issues,
      });
    }

    const controller = new AbortController();
    const abort = () => controller.abort(new DOMException("Client disconnected.", "AbortError"));
    request.raw.once("aborted", abort);
    const signals: BrowserSignal[] = [];

    try {
      const batch = await collectPages(parsed.data, (signal) => signals.push(signal), controller.signal);
      return { batch, signals };
    } finally {
      request.raw.off("aborted", abort);
    }
  });

  app.post("/api/runs", async (request, reply) => {
    const parsed = QueryInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "INVALID_QUERY_INPUT",
        details: parsed.error.issues,
      });
    }

    try {
      const run = runStore.create(parsed.data);
      return reply.status(202).send(
        CreateRunResponseSchema.parse({
          runId: run.runId,
          eventsUrl: `/api/runs/${run.runId}/events`,
          queued: true,
        }),
      );
    } catch (error) {
      if (error instanceof ActiveRunConflictError) {
        return reply.status(409).send({
          error: "ACTIVE_RUN",
          runId: error.activeRunId,
        });
      }
      throw error;
    }
  });

  app.get("/api/runs/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const run = runStore.get(id);
    if (run === undefined) {
      return reply.status(404).send({ error: "RUN_NOT_FOUND" });
    }
    return run;
  });

  app.get("/api/runs/:id/events", (request, reply) => {
    const { id } = request.params as { id: string };
    const afterSequence = parseLastEventId(id, request.headers["last-event-id"]);
    if (afterSequence === undefined) {
      return reply.status(400).send({ error: "INVALID_LAST_EVENT_ID" });
    }

    const writeEvent = (event: EventEnvelope) => {
      reply.raw.write(formatSseEvent(event));
    };
    const subscription = runStore.subscribeAfter(id, afterSequence, writeEvent);
    if (subscription === undefined) {
      return reply.status(404).send({ error: "RUN_NOT_FOUND" });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    for (const event of subscription.events) {
      writeEvent(event);
    }
    request.raw.once("close", subscription.unsubscribe);
  });

  app.post("/api/runs/:id/clarification", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = ClarificationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "INVALID_CLARIFICATION",
        details: parsed.error.issues,
      });
    }

    try {
      const run = runStore.applyClarification(id, parsed.data);
      if (run === undefined) {
        return reply.status(404).send({ error: "RUN_NOT_FOUND" });
      }
      return reply.status(202).send({ run });
    } catch (error) {
      if (error instanceof InvalidRunStateError) {
        return reply.status(409).send({
          error: "RUN_NOT_AWAITING_CLARIFICATION",
          status: error.actual,
        });
      }
      throw error;
    }
  });

  app.post("/api/runs/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const run = runStore.cancel(id);
    if (run === undefined) {
      return reply.status(404).send({ error: "RUN_NOT_FOUND" });
    }
    return reply.status(202).send({ run });
  });

  return app;
}

function parseLastEventId(
  runId: string,
  header: string | string[] | undefined,
): number | undefined {
  if (header === undefined) {
    return 0;
  }
  if (Array.isArray(header) || !SseEventIdSchema.safeParse(header).success) {
    return undefined;
  }

  const separator = header.lastIndexOf(":");
  const eventRunId = header.slice(0, separator);
  const sequence = Number(header.slice(separator + 1));
  if (eventRunId !== runId || !Number.isSafeInteger(sequence)) {
    return undefined;
  }
  return sequence;
}

function formatSseEvent(event: EventEnvelope): string {
  return `id: ${event.runId}:${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
