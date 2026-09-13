import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, X } from "lucide-react";

import {
  createCredential,
  listCredentials,
  updateCredential,
  type CredentialDraft,
  type CredentialMetadata,
} from "./vault-api";
import "./vault.css";

const EMPTY_DRAFT: CredentialDraft = { domain: "", username: "", password: "" };

export function VaultDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<CredentialMetadata[]>([]);
  const [draft, setDraft] = useState<CredentialDraft>(EMPTY_DRAFT);
  const [editing, setEditing] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setBusy(true);
    setError(null);
    void listCredentials()
      .then(setItems)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load keychain."))
      .finally(() => setBusy(false));
  }, [open]);

  if (!open) return null;

  const edit = (item: CredentialMetadata) => {
    setEditing(item.id);
    setDraft({ domain: item.domain, username: item.username, password: "" });
    setError(null);
    setSuccess(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const saved = editing
        ? await updateCredential(editing, draft)
        : await createCredential(draft);
      setItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setDraft(EMPTY_DRAFT);
      setEditing(null);
      setSuccess(editing ? "Account updated." : "Website account saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save credential.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="vault-drawer" role="dialog" aria-modal="true" aria-labelledby="vault-heading" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-heading">
          <div><KeyRound size={18} /><h2 id="vault-heading">Steel keychain</h2></div>
          <button className="icon-button" aria-label="Close password vault" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="history-description">
          Save the portal host, not a path: <code>piazza.com</code>, <code>q.utoronto.ca</code>,
          <code>www.acorn.utoronto.ca</code>, or <code>idpz.utorauth.utoronto.ca</code> for UTORid.
          Steel may fill that password on the matching portal or the UofT sign-in host. UTORMFA still needs you.
        </p>
        <div className="vault-notice"><ShieldCheck size={15} />Username and password are encrypted on the server.</div>
        {error && <p className="vault-error" role="alert">{error}</p>}
        {success && <p className="vault-success" role="status">{success}</p>}
        <div className="vault-list">
          {busy && items.length === 0 ? <p>Loading keychain…</p> : items.map((item) => (
            <article className="vault-item" key={item.id}>
              <div><strong>{item.domain}</strong><span>{item.username}</span><small>••••••••••••</small></div>
              <button type="button" onClick={() => edit(item)}>Edit</button>
            </article>
          ))}
        </div>
        <form className="vault-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <h3>{editing ? "Update account" : "Add a website account"}</h3>
          <label>Website domain<input required placeholder="portal.example.edu" value={draft.domain} onChange={(event) => setDraft((value) => ({...value, domain: event.target.value}))} /></label>
          <label>UTORid<input required autoComplete="username" placeholder="Your UTORid" value={draft.username} onChange={(event) => setDraft((value) => ({...value, username: event.target.value}))} /></label>
          <label>{editing ? "New password (leave blank to keep current)" : "Password"}<input required={!editing} autoComplete="new-password" type={showSecret ? "text" : "password"} placeholder={editing ? "Keep current password" : "Password"} value={draft.password} onChange={(event) => setDraft((value) => ({...value, password: event.target.value}))} /></label>
          <div className="vault-actions">
            <button type="button" onClick={() => setShowSecret((value) => !value)}>{showSecret ? "Hide password" : "Show password"}</button>
            <button type="submit" className="vault-save" disabled={busy}>{busy ? "Saving…" : editing ? "Confirm changes" : "Confirm & save account"}</button>
          </div>
        </form>
      </aside>
    </div>
  );
}
