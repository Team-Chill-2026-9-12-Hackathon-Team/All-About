import type { SourceConfig } from "@allabout/contracts";
import Fastify, { type FastifyServerOptions } from "fastify";

import { registerRunRoutes } from "./routes.js";
import { registerVaultRoutes } from "./vault-routes.js";
import type { RunExecutor } from "./run-executor.js";
import { RunStore } from "./run-store.js";
import { VaultStore } from "./vault-store.js";

export interface AppDependencies {
  runStore?: RunStore;
  sources?: SourceConfig[];
  runExecutor?: Pick<RunExecutor, "start" | "cancel">;
  vaultStore?: VaultStore;
}

export function buildApp(
  options: FastifyServerOptions = {},
  dependencies: AppDependencies = {},
) {
  const app = Fastify(options);
  const runStore = dependencies.runStore ?? new RunStore();
  const sources = dependencies.sources ?? [];

  app.get("/api/health", async () => ({ ok: true as const }));
  if (dependencies.vaultStore) {
    registerVaultRoutes(app, dependencies.vaultStore);
  }
  registerRunRoutes(app, {
    runStore,
    sources,
    executionAvailable: dependencies.runExecutor !== undefined,
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
