import Fastify, { type FastifyServerOptions } from "fastify";
import { collectPages as collectWithSteel } from "@allabout/browser";
import {
  QueryPlanSchema,
  type BrowserSignal,
  type CollectPages,
} from "@allabout/contracts";

interface AppDependencies {
  collectPages?: CollectPages;
}

export function buildApp(
  options: FastifyServerOptions = {},
  dependencies: AppDependencies = {},
) {
  const app = Fastify(options);
  const collectPages = dependencies.collectPages ?? collectWithSteel;

  app.get("/api/health", async () => ({ ok: true as const }));

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

  return app;
}
