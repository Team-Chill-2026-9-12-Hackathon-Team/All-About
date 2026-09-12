import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { VaultStore, hostsMatch } from "../src/vault-store.js";

function tempVault() {
  return new VaultStore({
    filePath: join(mkdtempSync(join(tmpdir(), "allabout-vault-")), "vault.enc"),
    masterKey: "test-master-key",
  });
}

describe("VaultStore", () => {
  it("stores secrets encrypted and never lists passwords", () => {
    const vault = tempVault();
    const saved = vault.add({
      host: "https://www.piazza.com/login",
      username: "student@utoronto.ca",
      password: "not-a-real-password",
      label: "Piazza",
    });
    expect(saved.host).toBe("piazza.com");
    expect(saved).not.toHaveProperty("password");
    expect(JSON.stringify(vault.list())).not.toContain("not-a-real-password");
    expect(vault.secretsForHosts(["piazza.com"])).toEqual([
      { host: "piazza.com", username: "student@utoronto.ca", password: "not-a-real-password" },
    ]);
    expect(vault.remove(saved.id)).toBe(true);
    expect(vault.secretsForHosts(["piazza.com"])).toEqual([]);
  });

  it("matches hosts without www or path", () => {
    expect(hostsMatch("piazza.com", "www.piazza.com")).toBe(true);
    expect(hostsMatch("q.utoronto.ca", "acorn.utoronto.ca")).toBe(false);
    expect(hostsMatch("utoronto.ca", "q.utoronto.ca")).toBe(false);
  });

  it("does not unlock sibling campus hosts from a parent domain", () => {
    const vault = tempVault();
    vault.add({
      host: "utoronto.ca",
      username: "student",
      password: "parent-only",
    });
    expect(vault.secretsForHosts(["q.utoronto.ca", "www.acorn.utoronto.ca"])).toEqual([]);
    expect(vault.secretsForHosts(["www.utoronto.ca"])).toEqual([
      { host: "utoronto.ca", username: "student", password: "parent-only" },
    ]);
  });
});
