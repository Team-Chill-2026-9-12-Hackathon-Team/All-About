export interface CredentialMetadata {
  id: string;
  domain: string;
  username: string;
  createdAt: string;
  updatedAt: string;
}

export interface CredentialDraft {
  domain: string;
  username: string;
  password: string;
}

interface CredentialListResponse {
  credentials: CredentialMetadata[];
}

interface CredentialResponse {
  credential: CredentialMetadata;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as T & {error?: {message?: string}};
  if (!response.ok) {
    throw new Error(body.error?.message ?? `Credential request failed (HTTP ${response.status}).`);
  }
  return body;
}

export async function listCredentials(fetcher: typeof fetch = fetch): Promise<CredentialMetadata[]> {
  const response = await fetcher("/api/credentials", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  return (await parseResponse<CredentialListResponse>(response)).credentials;
}

export async function createCredential(
  draft: CredentialDraft,
  fetcher: typeof fetch = fetch,
): Promise<CredentialMetadata> {
  const response = await fetcher("/api/credentials", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(draft),
  });
  return (await parseResponse<CredentialResponse>(response)).credential;
}

export async function updateCredential(
  id: string,
  draft: CredentialDraft,
  fetcher: typeof fetch = fetch,
): Promise<CredentialMetadata> {
  const payload = {
    domain: draft.domain,
    username: draft.username,
    ...(draft.password ? { password: draft.password } : {}),
  };
  const response = await fetcher(`/api/credentials/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
  });
  return (await parseResponse<CredentialResponse>(response)).credential;
}
