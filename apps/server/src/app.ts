import type { SourceConfig } from "@allabout/contracts";
import Fastify, { type FastifyServerOptions } from "fastify";

import { registerCredentialRoutes } from "./credential-routes.js";
import type { CredentialVault } from "./credential-vault.js";
import { registerRunRoutes } from "./routes.js";
import type { RunExecutor } from "./run-executor.js";
import { RunStore } from "./run-store.js";

export interface AppDependencies {
  runStore?: RunStore;
  sources?: SourceConfig[];
  runExecutor?: Pick<RunExecutor, "start" | "cancel">;
  credentialVault?: CredentialVault;
}

export function buildApp(
  options: FastifyServerOptions = {},
  dependencies: AppDependencies = {},
) {
  const app = Fastify(options);
  const runStore = dependencies.runStore ?? new RunStore();
  const sources = dependencies.sources ?? [];

  app.get("/api/health", async () => ({ ok: true as const }));
  registerCredentialRoutes(app, dependencies.credentialVault);
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
