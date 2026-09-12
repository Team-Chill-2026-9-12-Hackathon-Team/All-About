import { config as loadDotEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const rootEnvPath = fileURLToPath(new URL("../../../.env", import.meta.url));

const serverEnvironmentSchema = z.object({
  HOST: z.string().trim().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_001),
  OPENAI_API_KEY: z.string().trim().min(1).optional(),
  OPENAI_MODEL: z.string().trim().min(1).optional(),
  STEEL_API_KEY: z.string().trim().min(1).optional(),
});

export interface ServerConfig {
  host: string;
  port: number;
  openAiApiKey: string | undefined;
  openAiModel: string | undefined;
  openAiConfigured: boolean;
  steelConfigured: boolean;
}

export function loadRootEnvironment(): void {
  loadDotEnv({ path: rootEnvPath, quiet: true });
}

export function readServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const parsed = serverEnvironmentSchema.parse(environment);

  return {
    host: parsed.HOST,
    port: parsed.PORT,
    openAiApiKey: parsed.OPENAI_API_KEY,
    openAiModel: parsed.OPENAI_MODEL,
    openAiConfigured:
      parsed.OPENAI_API_KEY !== undefined && parsed.OPENAI_MODEL !== undefined,
    steelConfigured: parsed.STEEL_API_KEY !== undefined,
  };
}
