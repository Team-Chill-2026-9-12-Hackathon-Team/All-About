import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

const SecretRecordSchema = z.strictObject({
  id: z.string().trim().min(1),
  host: z.string().trim().min(1),
  username: z.string().trim().min(1),
  password: z.string().min(1),
  label: z.string().trim().min(1),
  createdAt: z.string().datetime({ offset: true }),
});

const VaultFileSchema = z.strictObject({
  version: z.literal(1),
  entries: z.array(SecretRecordSchema),
});

export type VaultSecret = z.infer<typeof SecretRecordSchema>;

export interface VaultPublicEntry {
  id: string;
  host: string;
  username: string;
  label: string;
  createdAt: string;
}

export interface SiteCredential {
  host: string;
  username: string;
  password: string;
}

export interface VaultStoreOptions {
  filePath: string;
  masterKey: string;
}

export class VaultValidationError extends Error {}

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? "";
}

export function hostsMatch(storedHost: string, pageHost: string): boolean {
  return normalizeHost(storedHost) === normalizeHost(pageHost);
}

export class VaultStore {
  readonly #filePath: string;
  readonly #key: Buffer;
  #entries: VaultSecret[];

  constructor(options: VaultStoreOptions) {
    if (options.masterKey.trim().length < 8) {
      throw new VaultValidationError("Vault master key must be at least 8 characters.");
    }
    this.#filePath = options.filePath;
    this.#key = scryptSync(options.masterKey, "allabout-vault-v1", 32);
    this.#entries = this.#readFile();
  }

  list(): VaultPublicEntry[] {
    return this.#entries.map(toPublic);
  }

  add(input: { host: string; username: string; password: string; label?: string | undefined }): VaultPublicEntry {
    const host = normalizeHost(input.host);
    if (!host || host.includes(" ") || /[\\/]/.test(host)) {
      throw new VaultValidationError("Host must be a site hostname such as piazza.com.");
    }
    const username = input.username.trim();
    if (!username) throw new VaultValidationError("Username is required.");
    if (!input.password) throw new VaultValidationError("Password is required.");
    const created: VaultSecret = {
      id: randomBytes(8).toString("hex"),
      host,
      username,
      password: input.password,
      label: input.label?.trim() || host,
      createdAt: new Date().toISOString(),
    };
    this.#entries = [
      ...this.#entries.filter((entry) => !(hostsMatch(entry.host, host) && entry.username === username)),
      created,
    ];
    this.#writeFile();
    return toPublic(created);
  }

  remove(id: string): boolean {
    const next = this.#entries.filter((entry) => entry.id !== id);
    if (next.length === this.#entries.length) return false;
    this.#entries = next;
    this.#writeFile();
    return true;
  }

  secretsForHosts(hosts: string[]): SiteCredential[] {
    return this.#entries
      .filter((entry) => hosts.some((host) => hostsMatch(entry.host, host)))
      .map((entry) => ({ host: entry.host, username: entry.username, password: entry.password }));
  }

  #readFile(): VaultSecret[] {
    try {
      const raw = readFileSync(this.#filePath);
      const parsed = VaultFileSchema.parse(decrypt(raw, this.#key));
      return parsed.entries;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw new VaultValidationError("Vault file could not be read with the current master key.");
    }
  }

  #writeFile(): void {
    mkdirSync(dirname(this.#filePath), { recursive: true });
    const payload = VaultFileSchema.parse({ version: 1, entries: this.#entries });
    writeFileSync(this.#filePath, encrypt(payload, this.#key), { mode: 0o600 });
  }
}

function toPublic(entry: VaultSecret): VaultPublicEntry {
  return {
    id: entry.id,
    host: entry.host,
    username: entry.username,
    label: entry.label,
    createdAt: entry.createdAt,
  };
}

function encrypt(value: unknown, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

function decrypt(buffer: Buffer, key: Buffer): unknown {
  if (buffer.length < 28) throw new VaultValidationError("Vault file is truncated.");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const body = buffer.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  return JSON.parse(plain) as unknown;
}
