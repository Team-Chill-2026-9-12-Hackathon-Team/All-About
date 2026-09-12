import type { Page } from "playwright";

export interface SiteCredential {
  host: string;
  username: string;
  password: string;
}

export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? "";
}

export function hostsMatch(storedHost: string, pageHost: string): boolean {
  return normalizeHost(storedHost) === normalizeHost(pageHost);
}

export function credentialForHost(credentials: SiteCredential[], pageHost: string): SiteCredential | undefined {
  return credentials.find((item) => hostsMatch(item.host, pageHost));
}

export async function pageHasLoginForm(page: Page): Promise<boolean> {
  return (await page.locator('input[type="password"]').count()) > 0;
}

export async function fillLoginForm(
  page: Page,
  credential: SiteCredential,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) return false;
  const password = page.locator('input[type="password"]').first();
  if ((await password.count()) === 0) return false;

  const user = page.locator(
    'input[type="email"], input[name="email"], input[name="username"], input[autocomplete="username"], input[type="text"]',
  ).first();
  if ((await user.count()) === 0) return false;

  await user.fill(credential.username, { timeout: 5_000 });
  await password.fill(credential.password, { timeout: 5_000 });
  const submit = page.locator('button[type="submit"], input[type="submit"], button:has-text("Log in"), button:has-text("Sign in")').first();
  if ((await submit.count()) > 0) {
    await Promise.all([
      page.waitForLoadState("domcontentloaded").catch(() => undefined),
      submit.click({ timeout: 5_000 }),
    ]);
  } else {
    await password.press("Enter");
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  }
  return true;
}
