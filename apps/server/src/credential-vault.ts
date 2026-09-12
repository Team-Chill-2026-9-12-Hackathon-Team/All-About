import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface CredentialInput {
  domain: string;
  username: string;
  password: string;
}

export interface CredentialUpdate {
  domain: string;
  username: string;
  password?: string;
}

export interface CredentialMetadata {
  id: string;
  domain: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedCredential {
  id: string;
  domain: string;
  username: string;
  password: string;
}

export interface CredentialVault {
  list(): Promise<CredentialMetadata[]>;
  create(input: CredentialInput): Promise<CredentialMetadata>;
  update(id: string, input: CredentialUpdate): Promise<CredentialMetadata>;
  resolve(domain: string): Promise<ResolvedCredential | null>;
}

interface CipherEnvelope {
  iv: string;
  tag: string;
  ciphertext: string;
}

interface StoredCredential {
  id: string;
  domain: string;
  secret: CipherEnvelope;
  createdAt: string;
  updatedAt: string;
}

interface StoredVault {
  version: 1;
  credentials: StoredCredential[];
}

interface SecretPayload {
  username: string;
  password: string;
}

export class CredentialNotFoundError extends Error {}

export class FileCredentialVault implements CredentialVault {
  private mutation: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly key: Buffer,
  ) {
    if (key.byteLength !== 32) {
      throw new Error("Credential vault key must contain exactly 32 bytes.");
    }
  }

  async list(): Promise<CredentialMetadata[]> {
    await this.mutation;
    const vault = await this.readVault();
    return vault.credentials
      .map((record) => this.toMetadata(record))
      .sort((left, right) => left.domain.localeCompare(right.domain));
  }

  create(input: CredentialInput): Promise<CredentialMetadata> {
    return this.mutate(async (vault) => {
      const domain = normalizeCredentialDomain(input.domain);
      if (vault.credentials.some((record) => record.domain === domain)) {
        throw new Error("A credential already exists for this domain.");
      }
      const now = new Date().toISOString();
      const record: StoredCredential = {
        id: randomUUID(),
        domain,
        secret: this.encrypt(randomUUID(), domain, {
          username: requireValue(input.username, "Username"),
          password: requireValue(input.password, "Password"),
        }),
        createdAt: now,
        updatedAt: now,
      };
      // The encryption AAD must use the persisted record ID.
      record.secret = this.encrypt(record.id, domain, {
        username: requireValue(input.username, "Username"),
        password: requireValue(input.password, "Password"),
      });
      vault.credentials.push(record);
      return this.toMetadata(record);
    });
  }

  update(id: string, input: CredentialUpdate): Promise<CredentialMetadata> {
    return this.mutate(async (vault) => {
      const record = vault.credentials.find((candidate) => candidate.id === id);
      if (!record) throw new CredentialNotFoundError("Credential not found.");
      const domain = normalizeCredentialDomain(input.domain);
      if (vault.credentials.some((candidate) => candidate.id !== id && candidate.domain === domain)) {
        throw new Error("A credential already exists for this domain.");
      }
      const current = this.decrypt(record);
      record.domain = domain;
      record.updatedAt = new Date().toISOString();
      record.secret = this.encrypt(record.id, domain, {
        username: requireValue(input.username, "Username"),
        password: input.password === undefined ? current.password : requireValue(input.password, "Password"),
      });
      return this.toMetadata(record);
    });
  }

  async resolve(rawDomain: string): Promise<ResolvedCredential | null> {
    await this.mutation;
    const domain = normalizeCredentialDomain(rawDomain);
    const vault = await this.readVault();
    const record = vault.credentials.find((candidate) => candidate.domain === domain);
    if (!record) return null;
    const secret = this.decrypt(record);
    return { id: record.id, domain, ...secret };
  }

  private async toMetadata(record: StoredCredential): Promise<CredentialMetadata> {
    const secret = this.decrypt(record);
    return {
      id: record.id,
      domain: record.domain,
      username: secret.username,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private mutate<T>(operation: (vault: StoredVault) => Promise<T>): Promise<T> {
    let result: T;
    const pending = this.mutation.then(async () => {
      const vault = await this.readVault();
      result = await operation(vault);
      await this.writeVault(vault);
    });
    this.mutation = pending.catch(() => undefined);
    return pending.then(() => result!);
  }

  private encrypt(id: string, domain: string, payload: SecretPayload): CipherEnvelope {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(`${id}\0${domain}`, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);
    return {
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
  }

  private decrypt(record: StoredCredential): SecretPayload {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(record.secret.iv, "base64"),
    );
    decipher.setAAD(Buffer.from(`${record.id}\0${record.domain}`, "utf8"));
    decipher.setAuthTag(Buffer.from(record.secret.tag, "base64"));
    const cleartext = Buffer.concat([
      decipher.update(Buffer.from(record.secret.ciphertext, "base64")),
      decipher.final(),
    ]);
    const value = JSON.parse(cleartext.toString("utf8")) as Partial<SecretPayload>;
    return {
      username: requireValue(value.username, "Stored username"),
      password: requireValue(value.password, "Stored password"),
    };
  }

  private async readVault(): Promise<StoredVault> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<StoredVault>;
      if (parsed.version !== 1 || !Array.isArray(parsed.credentials)) {
        throw new Error("Credential vault file has an unsupported format.");
      }
      return { version: 1, credentials: parsed.credentials };
    } catch (error) {
      if (isMissingFile(error)) return { version: 1, credentials: [] };
      throw error;
    }
  }

  private async writeVault(vault: StoredVault): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(vault, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.filePath);
  }
}

export function decodeCredentialVaultKey(encoded: string): Buffer {
  const key = Buffer.from(encoded.trim(), "base64");
  if (key.byteLength !== 32) {
    throw new Error("CREDENTIAL_VAULT_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

export function normalizeCredentialDomain(rawDomain: string): string {
  const domain = rawDomain.trim().toLowerCase().replace(/\.$/, "");
  if (
    !domain ||
    domain.includes("/") ||
    domain.includes(":") ||
    domain.includes("@") ||
    domain.includes("?") ||
    domain.includes("#") ||
    /\s/.test(domain)
  ) {
    throw new Error("Domain must be a hostname without a protocol, path, or port.");
  }
  const parsed = new URL(`https://${domain}`);
  if (parsed.hostname !== domain || !domain.includes(".")) {
    throw new Error("Domain must be a valid fully qualified hostname.");
  }
  return domain;
}

function requireValue(value: string | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
