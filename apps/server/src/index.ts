import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { buildApp } from "./app.js";
import { decodeCredentialVaultKey, FileCredentialVault } from "./credential-vault.js";
import { loadRootEnvironment, readServerConfig } from "./config.js";
import { createRunRuntime } from "./runtime.js";
import { liveSourceRegistry } from "./source-registry.js";

loadRootEnvironment();

const serverConfig = readServerConfig();
const credentialVault = createLocalCredentialVault();
const runtime = createRunRuntime({
  sources: liveSourceRegistry,
  ...(serverConfig.openAiApiKey ? { apiKey: serverConfig.openAiApiKey } : {}),
  ...(serverConfig.openAiModel ? { model: serverConfig.openAiModel } : {}),
  ...(credentialVault
    ? { resolveCredential: (domain: string) => credentialVault.resolve(domain) }
    : {}),
});
const app = buildApp(
  { logger: true },
  {
    ...runtime,
    ...(credentialVault ? { credentialVault } : {}),
  },
);

if (!serverConfig.openAiConfigured) {
  app.log.warn(
    "OPENAI_API_KEY and OPENAI_MODEL are missing; allowlisted sourceIds use the default plan.",
  );
}
if (!serverConfig.steelConfigured) {
  app.log.warn(
    "STEEL_API_KEY is missing; LIVE_WEB collection will fail, DEMO101 LIVE_FIXTURE still runs locally.",
  );
}
if (credentialVault === undefined) {
  app.log.warn(
    "CREDENTIAL_VAULT_KEY is not configured; keychain endpoints and automatic login are unavailable.",
  );
}

try {
  await app.listen({ host: serverConfig.host, port: serverConfig.port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}

function createLocalCredentialVault(): FileCredentialVault | undefined {
  const configured = process.env.CREDENTIAL_VAULT_KEY?.trim();
  const keyFile = fileURLToPath(new URL("../../../.data/credential-vault.key", import.meta.url));
  let encoded = configured;
  if (!encoded) {
    try {
      encoded = readFileSync(keyFile, "utf8").trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      encoded = randomBytes(32).toString("base64");
      mkdirSync(dirname(keyFile), { recursive: true, mode: 0o700 });
      writeFileSync(keyFile, `${encoded}\n`, { mode: 0o600 });
    }
  }
  const vaultPath =
    process.env.CREDENTIAL_VAULT_PATH?.trim() ||
    fileURLToPath(new URL("../../../.data/credential-vault.json", import.meta.url));
  return new FileCredentialVault(vaultPath, decodeCredentialVaultKey(encoded));
}
