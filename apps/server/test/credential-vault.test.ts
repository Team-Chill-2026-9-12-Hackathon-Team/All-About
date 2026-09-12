import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { FileCredentialVault } from "../src/credential-vault.js";

const temporaryDirectories: string[] = [];

async function createVault() {
  const directory = await mkdtemp(join(tmpdir(), "allabout-vault-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "credentials.json");
  return { path, vault: new FileCredentialVault(path, randomBytes(32)) };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })));
});

describe("encrypted credential vault", () => {
  it("stores usernames and passwords as authenticated ciphertext", async () => {
    const { path, vault } = await createVault();
    const created = await vault.create({
      domain: "Piazza.com",
      username: "student@example.edu",
      password: "correct horse battery staple",
    });

    expect(created).toMatchObject({
      domain: "piazza.com",
      username: "student@example.edu",
    });
    const raw = await readFile(path, "utf8");
    expect(raw).not.toContain("student@example.edu");
    expect(raw).not.toContain("correct horse battery staple");

    await expect(vault.resolve("piazza.com")).resolves.toMatchObject({
      domain: "piazza.com",
      username: "student@example.edu",
      password: "correct horse battery staple",
    });
    await expect(vault.resolve("sub.piazza.com")).resolves.toBeNull();
  });

  it("preserves the password when metadata is updated without a replacement", async () => {
    const { vault } = await createVault();
    const created = await vault.create({
      domain: "piazza.com",
      username: "first@example.edu",
      password: "keep-this-secret",
    });
    await vault.update(created.id, {
      domain: "piazza.com",
      username: "second@example.edu",
    });

    await expect(vault.resolve("piazza.com")).resolves.toMatchObject({
      username: "second@example.edu",
      password: "keep-this-secret",
    });
  });

  it("never returns a password from HTTP metadata endpoints", async () => {
    const { vault } = await createVault();
    const app = buildApp({}, { credentialVault: vault });
    const created = await app.inject({
      method: "POST",
      url: "/api/credentials",
      payload: {
        domain: "piazza.com",
        username: "student@example.edu",
        password: "server-only-secret",
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.body).not.toContain("server-only-secret");
    expect(created.headers["cache-control"]).toBe("no-store");

    const listed = await app.inject({ method: "GET", url: "/api/credentials" });
    expect(listed.statusCode).toBe(200);
    expect(listed.body).not.toContain("server-only-secret");
    expect(listed.json().credentials[0]).toMatchObject({
      domain: "piazza.com",
      username: "student@example.edu",
    });
    expect(listed.json().credentials[0]).not.toHaveProperty("password");
    await app.close();
  });
});
