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

try {
  await app.listen({ host: serverConfig.host, port: serverConfig.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
