import type { Page } from "playwright";
import type { SourceConfig } from "@allabout/contracts";

import { assertAllowedUrl, looksLikeAuthentication } from "./page-tools.js";

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

export async function attemptCredentialLogin(
  page: Page,
  target: SourceConfig,
  resolveCredential: CredentialResolver,
  signal: AbortSignal,
): Promise<LoginResult> {
  throwIfAborted(signal);
  let loginUrl: URL;
  try {
    loginUrl = assertAllowedUrl(page.url(), target.allowedHosts);
  } catch {
    return { status: "form_unsupported" };
  }
  const credential = await resolveCredential(loginUrl.hostname);
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
      if (submitUrl.hostname.toLowerCase() !== loginUrl.hostname.toLowerCase()) {
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

  const finalUrl = page.url();
  const stillHasPassword = (await page.locator('input[type="password"]:visible').count()) > 0;
  const body = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
  const needsSecondFactor = /two[- ]factor|multi[- ]factor|verification code|authenticator|security code/i.test(body);
  if ((looksLikeAuthentication(null, finalUrl) && stillHasPassword) || needsSecondFactor) {
    return { status: "form_unsupported" };
  }
  assertAllowedUrl(finalUrl, target.allowedHosts);
  return { status: "authenticated", url: finalUrl };
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new DOMException("The browser run was cancelled.", "AbortError");
  }
}
