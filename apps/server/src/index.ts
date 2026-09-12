import { buildApp } from "./app.js";
import { loadRootEnvironment, readServerConfig } from "./config.js";
import { createRunRuntime } from "./runtime.js";
import { liveSourceRegistry } from "./source-registry.js";

loadRootEnvironment();

const serverConfig = readServerConfig();
const runtime =
  serverConfig.openAiApiKey !== undefined &&
  serverConfig.openAiModel !== undefined &&
  serverConfig.steelConfigured
    ? createRunRuntime({
        sources: liveSourceRegistry,
        apiKey: serverConfig.openAiApiKey,
        model: serverConfig.openAiModel,
      })
    : undefined;
const app =
  runtime === undefined
    ? buildApp({ logger: true }, { sources: liveSourceRegistry })
    : buildApp({ logger: true }, runtime);

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
