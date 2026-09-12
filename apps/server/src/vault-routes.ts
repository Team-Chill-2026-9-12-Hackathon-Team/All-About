import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";

import { VaultValidationError, type VaultStore } from "./vault-store.js";

const CreateVaultEntrySchema = z.strictObject({
  host: z.string().trim().min(1),
  username: z.string().trim().min(1),
  password: z.string().min(1),
  label: z.string().trim().min(1).optional(),
});

export function registerVaultRoutes(app: FastifyInstance, vault: VaultStore): void {
  app.get("/api/vault", async () => ({ entries: vault.list() }));

  app.post("/api/vault", async (request, reply) => {
    const parsed = CreateVaultEntrySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendVaultError(reply, 400, "Invalid vault entry. Host, username, and password are required.");
    }
    try {
      const entry = vault.add(parsed.data);
      return reply.code(201).send({ entry });
    } catch (error) {
      const message = error instanceof VaultValidationError ? error.message : "Could not save the vault entry.";
      return sendVaultError(reply, 400, message);
    }
  });

  app.delete("/api/vault/:id", async (request, reply) => {
    const id = typeof request.params === "object" && request.params && "id" in request.params
      ? String(request.params.id)
      : "";
    if (!id) return sendVaultError(reply, 400, "Vault entry id is required.");
    if (!vault.remove(id)) return sendVaultError(reply, 404, "Vault entry was not found.");
    return reply.code(204).send();
  });
}

function sendVaultError(reply: FastifyReply, statusCode: number, message: string) {
  return reply.code(statusCode).send({ error: { code: "VAULT_ERROR", message } });
}
