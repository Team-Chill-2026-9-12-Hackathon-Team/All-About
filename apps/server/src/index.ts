import { fileURLToPath } from "node:url";

import { buildApp } from "./app.js";
import { loadRootEnvironment, readServerConfig } from "./config.js";
import { createRunRuntime } from "./runtime.js";
import { liveSourceRegistry } from "./source-registry.js";
import { VaultStore } from "./vault-store.js";

loadRootEnvironment();

const serverConfig = readServerConfig();
const vaultStore = new VaultStore({
  filePath:
    process.env.VAULT_FILE ??
    fileURLToPath(new URL("../../../.data/vault.enc", import.meta.url)),
  masterKey: process.env.VAULT_MASTER_KEY ?? "allabout-dev-vault-key",
});
const runtime =
  serverConfig.openAiApiKey !== undefined &&
  serverConfig.openAiModel !== undefined &&
  serverConfig.steelConfigured
    ? createRunRuntime({
        sources: liveSourceRegistry,
        apiKey: serverConfig.openAiApiKey,
        model: serverConfig.openAiModel,
        vaultStore,
      })
    : undefined;
const app =
  runtime === undefined
    ? buildApp({ logger: true }, { sources: liveSourceRegistry, vaultStore })
    : buildApp({ logger: true }, { ...runtime, vaultStore });

if (!serverConfig.openAiConfigured) {
  app.log.warn(
    "OPENAI_API_KEY and OPENAI_MODEL are both required for run execution; health checks and source discovery remain available.",
  );
}
if (!serverConfig.steelConfigured) {
  app.log.warn(
    "STEEL_API_KEY is required for live browsing; health checks and source discovery remain available.",
  );
}
if (runtime === undefined) {
  app.log.warn(
    "Run execution dependencies are incomplete; POST /api/runs will return 503.",
  );
}

try {
  await app.listen({ host: serverConfig.host, port: serverConfig.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
