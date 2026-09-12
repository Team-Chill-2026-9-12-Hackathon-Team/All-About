import type { Page } from "playwright";
import type { SourceConfig } from "@allabout/contracts";

import { isAllowedLoginHost, loginHostsFor } from "./login-hosts.js";
import { assertAllowedUrl, looksLikeAuthentication } from "./page-tools.js";

export { isAllowedLoginHost, loginHostsFor, UOFT_SSO_HOSTS } from "./login-hosts.js";

export interface BrowserCredential {
  username: string;
  password: string;
}

export type CredentialResolver = (
  hostname: string,
) => Promise<BrowserCredential | null>;

export type LoginResult =
  | { status: "authenticated"; url: string }
  | { status: "credential_missing" }
  | { status: "form_unsupported" };

const USERNAME_SELECTOR = [
  'input[autocomplete="username"]',
  'input[type="email"]',
  'input[name*="user" i]',
  'input[id*="user" i]',
  'input[name*="email" i]',
].map((selector) => `${selector}:visible`).join(", ");

const MFA_TEXT =
  /two[- ]factor|multi[- ]factor|verification code|authenticator|security code|duo|utormfa|approve the request/i;

const CONTENT_WAIT_MS = 15_000;

export async function attemptCredentialLogin(
  page: Page,
  target: SourceConfig,
  resolveCredential: CredentialResolver,
  signal: AbortSignal,
): Promise<LoginResult> {
  throwIfAborted(signal);
  const loginUrl = parseHttpsUrl(page.url());
  if (!loginUrl || !isAllowedLoginHost(loginUrl.hostname, target)) {
    return { status: "form_unsupported" };
  }
  const credential = await resolveCredentialForSource(loginUrl.hostname, target, resolveCredential);
  if (!credential) return { status: "credential_missing" };

  const password = page.locator('input[type="password"]:visible').first();
  const username = page.locator(USERNAME_SELECTOR).first();
  if ((await password.count()) === 0 || (await username.count()) === 0) {
    return { status: "form_unsupported" };
  }

  const form = password.locator("xpath=ancestor::form[1]");
  if ((await form.count()) > 0) {
    const action = await form.getAttribute("action");
    if (action) {
      const submitUrl = new URL(action, loginUrl);
      if (!isAllowedLoginHost(submitUrl.hostname, target)) {
        return { status: "form_unsupported" };
      }
    }
  }

  throwIfAborted(signal);
  await username.fill(credential.username);
  await password.fill(credential.password);
  await password.press("Enter");
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  throwIfAborted(signal);

  if (await pageShowsMfa(page)) return { status: "form_unsupported" };

  const contentUrl = await waitForContentHost(page, target, signal);
  if (!contentUrl) return { status: "form_unsupported" };
  return { status: "authenticated", url: contentUrl };
}

async function resolveCredentialForSource(
  hostname: string,
  target: SourceConfig,
  resolveCredential: CredentialResolver,
): Promise<BrowserCredential | null> {
  const candidates = uniqueHosts([hostname, ...loginHostsFor(target)]);
  for (const host of candidates) {
    const credential = await resolveCredential(host);
    if (credential) return credential;
  }
  return null;
}

async function waitForContentHost(
  page: Page,
  target: SourceConfig,
  signal: AbortSignal,
): Promise<string | null> {
  const deadline = Date.now() + CONTENT_WAIT_MS;
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    const captured = contentUrlIfReady(page.url(), target);
    if (captured) return captured;
    if (await pageShowsMfa(page)) return null;
    await page.waitForTimeout(250);
  }
  return contentUrlIfReady(page.url(), target);
}

function contentUrlIfReady(rawUrl: string, target: SourceConfig): string | null {
  try {
    const url = assertAllowedUrl(rawUrl, target.allowedHosts);
    if (looksLikeAuthentication(null, url.href)) return null;
    return url.href;
  } catch {
    return null;
  }
}

async function pageShowsMfa(page: Page): Promise<boolean> {
  const body = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
  return MFA_TEXT.test(body);
}

function parseHttpsUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function uniqueHosts(hosts: readonly string[]): string[] {
  return [...new Set(hosts.map((host) => host.trim().toLowerCase()).filter(Boolean))];
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new DOMException("The browser run was cancelled.", "AbortError");
  }
}
