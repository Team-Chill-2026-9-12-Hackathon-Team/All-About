import { buildApp } from "./app.js";
import { loadRootEnvironment, readServerConfig } from "./config.js";

loadRootEnvironment();

const serverConfig = readServerConfig();
const app = buildApp({ logger: true });

if (!serverConfig.openAiConfigured) {
  app.log.warn(
    "OPENAI_API_KEY is not configured; health checks and offline tests remain available.",
  );
}
app.log.warn(
  "Run execution is unavailable until a reviewed source registry is configured; POST /api/runs will return 503.",
);

try {
  await app.listen({ host: serverConfig.host, port: serverConfig.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
