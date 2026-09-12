export interface VaultPublicEntry {
  id: string;
  host: string;
  username: string;
  label: string;
  createdAt: string;
}

export async function listVaultEntries(): Promise<VaultPublicEntry[]> {
  const res = await fetch('/api/vault');
  if (!res.ok) throw new Error('Could not read the keychain.');
  const body = (await res.json()) as { entries: VaultPublicEntry[] };
  return body.entries;
}

export async function addVaultEntry(input: {
  host: string;
  username: string;
  password: string;
  label?: string;
}): Promise<VaultPublicEntry> {
  const res = await fetch('/api/vault', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? 'Could not save the keychain entry.');
  }
  const body = (await res.json()) as { entry: VaultPublicEntry };
  return body.entry;
}

export async function removeVaultEntry(id: string): Promise<void> {
  const res = await fetch(`/api/vault/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) throw new Error('Could not remove the keychain entry.');
}
