import { fileURLToPath } from "node:url";

import { buildApp } from "./app.js";
import { decodeCredentialVaultKey, FileCredentialVault } from "./credential-vault.js";
import { loadRootEnvironment, readServerConfig } from "./config.js";
import { createRunRuntime } from "./runtime.js";
import { liveSourceRegistry } from "./source-registry.js";

loadRootEnvironment();

const serverConfig = readServerConfig();
const vaultKey = process.env.CREDENTIAL_VAULT_KEY;
const credentialVaultPath = process.env.CREDENTIAL_VAULT_PATH?.trim();
const credentialVault = vaultKey
  ? new FileCredentialVault(
      credentialVaultPath ||
        fileURLToPath(new URL("../../../.data/credential-vault.json", import.meta.url)),
      decodeCredentialVaultKey(vaultKey),
    )
  : undefined;
const runtime =
  serverConfig.openAiApiKey !== undefined &&
  serverConfig.openAiModel !== undefined &&
  serverConfig.steelConfigured
    ? createRunRuntime({
        sources: liveSourceRegistry,
        apiKey: serverConfig.openAiApiKey,
        model: serverConfig.openAiModel,
        ...(credentialVault === undefined
          ? {}
          : { resolveCredential: (domain: string) => credentialVault.resolve(domain) }),
      })
    : undefined;
const app =
  runtime === undefined
    ? buildApp(
        { logger: true },
        {
          sources: liveSourceRegistry,
          ...(credentialVault === undefined ? {} : { credentialVault }),
        },
      )
    : buildApp(
        { logger: true },
        {
          ...runtime,
          ...(credentialVault === undefined ? {} : { credentialVault }),
        },
      );

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
if (credentialVault === undefined) {
  app.log.warn(
    "CREDENTIAL_VAULT_KEY is not configured; keychain endpoints and automatic login are unavailable.",
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
