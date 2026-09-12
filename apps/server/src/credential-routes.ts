import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";

import {
  CredentialNotFoundError,
  type CredentialVault,
} from "./credential-vault.js";

const credentialInputSchema = z.strictObject({
  domain: z.string().trim().min(1).max(253),
  username: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(4096),
});

const credentialUpdateSchema = z.strictObject({
  domain: z.string().trim().min(1).max(253),
  username: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(4096).optional(),
});

function noStore(reply: FastifyReply): void {
  reply.header("cache-control", "no-store");
  reply.header("pragma", "no-cache");
}

function unavailable(reply: FastifyReply) {
  return reply.code(503).send({
    error: {
      code: "CREDENTIAL_VAULT_UNAVAILABLE",
      message: "Credential storage is not configured on this server.",
    },
  });
}

function invalid(reply: FastifyReply, message = "The credential input is invalid.") {
  return reply.code(400).send({
    error: { code: "INVALID_CREDENTIAL", message },
  });
}

export function registerCredentialRoutes(
  app: FastifyInstance,
  vault: CredentialVault | undefined,
): void {
  app.get("/api/credentials", async (_request, reply) => {
    noStore(reply);
    if (!vault) return unavailable(reply);
    return { credentials: await vault.list() };
  });

  app.post<{ Body: unknown }>("/api/credentials", async (request, reply) => {
    noStore(reply);
    if (!vault) return unavailable(reply);
    const parsed = credentialInputSchema.safeParse(request.body);
    if (!parsed.success) return invalid(reply);
    try {
      const credential = await vault.create(parsed.data);
      return reply.code(201).send({ credential });
    } catch (error) {
      return invalid(reply, error instanceof Error ? error.message : undefined);
    }
  });

  app.put<{ Params: { id: string }; Body: unknown }>(
    "/api/credentials/:id",
    async (request, reply) => {
      noStore(reply);
      if (!vault) return unavailable(reply);
      const parsed = credentialUpdateSchema.safeParse(request.body);
      if (!parsed.success || !request.params.id.trim()) return invalid(reply);
      try {
        const credential = await vault.update(request.params.id, parsed.data);
        return { credential };
      } catch (error) {
        if (error instanceof CredentialNotFoundError) {
          return reply.code(404).send({
            error: { code: "CREDENTIAL_NOT_FOUND", message: "Credential not found." },
          });
        }
        return invalid(reply, error instanceof Error ? error.message : undefined);
      }
    },
  );
}
