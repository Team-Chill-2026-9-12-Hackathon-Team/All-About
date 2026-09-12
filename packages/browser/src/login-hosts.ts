import type { SourceConfig } from "@allabout/contracts";

/** Hosts that receive UTORid after Quercus, ACORN, or Piazza school SSO. */
export const UOFT_SSO_HOSTS = [
  "idpz.utorauth.utoronto.ca",
  "weblogin.utoronto.ca",
] as const;

const EXTRA_LOGIN_HOSTS: Record<string, readonly string[]> = {
  "piazza-login": UOFT_SSO_HOSTS,
  "quercus-login": UOFT_SSO_HOSTS,
  "acorn-login": UOFT_SSO_HOSTS,
};

export function loginHostsFor(target: SourceConfig): string[] {
  const extras = EXTRA_LOGIN_HOSTS[target.id] ?? [];
  return uniqueHosts([
    ...target.allowedHosts,
    new URL(target.entryUrl).hostname,
    ...extras,
  ]);
}

export function isAllowedLoginHost(hostname: string, target: SourceConfig): boolean {
  return loginHostsFor(target).includes(hostname.trim().toLowerCase());
}

function uniqueHosts(hosts: readonly string[]): string[] {
  return [...new Set(hosts.map((host) => host.trim().toLowerCase()).filter(Boolean))];
}
