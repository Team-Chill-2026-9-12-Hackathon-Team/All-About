import type { SourceConfig } from "@allabout/contracts";
import Fastify, { type FastifyServerOptions } from "fastify";

import { registerRunRoutes } from "./routes.js";
import type { RunExecutor } from "./run-executor.js";
import { RunStore } from "./run-store.js";

export interface AppDependencies {
  runStore?: RunStore;
  sources?: SourceConfig[];
  runExecutor?: Pick<RunExecutor, "start" | "cancel">;
}

export function buildApp(
  options: FastifyServerOptions = {},
  dependencies: AppDependencies = {},
) {
  const app = Fastify(options);
  const runStore = dependencies.runStore ?? new RunStore();
  const sources = dependencies.sources ?? [];

  app.get("/api/health", async () => ({ ok: true as const }));
  registerRunRoutes(app, {
    runStore,
    sources,
    ...(dependencies.runExecutor === undefined
      ? {}
      : {
          onRunCreated: (runId) => dependencies.runExecutor?.start(runId),
          onRunClarified: (runId) => dependencies.runExecutor?.start(runId),
          cancelRun: (runId) =>
            dependencies.runExecutor?.cancel(runId) ?? runStore.cancel(runId),
        }),
  });

  return app;
}
