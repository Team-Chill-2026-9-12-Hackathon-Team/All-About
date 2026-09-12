import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { VaultStore } from "../src/vault-store.js";

const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("vault routes", () => {
  it("creates, lists, and deletes a keychain entry without returning the password", async () => {
    const vaultStore = new VaultStore({
      filePath: join(mkdtempSync(join(tmpdir(), "allabout-vault-")), "vault.enc"),
      masterKey: "test-master-key",
    });
    const app = buildApp({}, { vaultStore });
    apps.push(app);

    const created = await app.inject({
      method: "POST",
      url: "/api/vault",
      payload: { host: "q.utoronto.ca", username: "demo.student", password: "secret-value" },
    });
    expect(created.statusCode).toBe(201);
    expect(JSON.stringify(created.json())).not.toContain("secret-value");
    const id = created.json().entry.id as string;

    const listed = await app.inject({ method: "GET", url: "/api/vault" });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().entries).toEqual([
      expect.objectContaining({ id, host: "q.utoronto.ca", username: "demo.student" }),
    ]);
    expect(JSON.stringify(listed.json())).not.toContain("secret-value");

    const removed = await app.inject({ method: "DELETE", url: `/api/vault/${id}` });
    expect(removed.statusCode).toBe(204);
  });
});
