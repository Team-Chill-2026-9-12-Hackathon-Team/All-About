import type { Page } from 'playwright';
import { isIP } from 'node:net';

const BLOCKED_TEXT =
  /verifying you are human|verify you are human|just a moment|access denied|pardon our interruption/i;
const AUTH_HOST_OR_PATH =
  /weblogin|login\.microsoftonline|\/login(?:[/?#]|$)|\/signin(?:[/?#]|$)/i;

export interface PageReadResult {
  title: string;
  text: string;
  publishedAt: string | null;
  updatedAt: string | null;
}

export interface VisibleLink {
  text: string;
  url: string;
}

export function assertAllowedUrl(rawUrl: string, allowedHosts: string[]): URL {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') {
    throw new Error('Only HTTPS navigation is supported.');
  }

  const hostname = url.hostname.toLowerCase();
  if (isPrivateNetworkHost(hostname)) {
    throw new Error(`Host ${url.hostname} is not allowed for public web collection.`);
  }

  const hosts = new Set(allowedHosts.map((host) => host.trim().toLowerCase()));
  if (!hosts.has(hostname)) {
    throw new Error(`Host ${url.hostname} is not registered for this source.`);
  }

  return url;
}

function isPrivateNetworkHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return true;

  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const [a = 0, b = 0] = host.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (ipVersion === 6) {
    return host === '::' || host === '::1' || /^f[cd]/i.test(host) || /^fe[89ab]/i.test(host);
  }
  return false;
}

export function looksBlocked(status: number | null, title: string, body: string): boolean {
  return (
    status === 403 ||
    status === 429 ||
    BLOCKED_TEXT.test(title) ||
    (body.length < 2_000 && BLOCKED_TEXT.test(body))
  );
}

export function looksLikeAuthentication(status: number | null, finalUrl: string): boolean {
  return status === 401 || AUTH_HOST_OR_PATH.test(finalUrl);
}

export async function readVisibleText(page: Page): Promise<PageReadResult> {
  const root = page.locator('main, [role="main"], article').first();
  const selected = (await root.count()) > 0 ? root : page.locator('body');
  const text = normalizeVisibleText(await selected.innerText({ timeout: 5_000 }));

  const publishedAt = await firstMetaContent(page, [
    'meta[property="article:published_time"]',
    'meta[name="datePublished"]',
    'meta[itemprop="datePublished"]',
  ]);
  const updatedAt = await firstMetaContent(page, [
    'meta[property="article:modified_time"]',
    'meta[name="dateModified"]',
    'meta[itemprop="dateModified"]',
  ]);

  return {
    title: (await page.title()).trim(),
    text,
    publishedAt: normalizeDateMetadata(publishedAt),
    updatedAt: normalizeDateMetadata(updatedAt),
  };
}

export async function readLinks(page: Page, allowedHosts: string[]): Promise<VisibleLink[]> {
  const anchors = await page.locator('a[href]:visible').all();
  const links: VisibleLink[] = [];
  for (const anchor of anchors.slice(0, 200)) {
    const href = await anchor.getAttribute('href');
    if (!href) continue;
    links.push({
      text: ((await anchor.textContent()) ?? '').replace(/\s+/g, ' ').trim(),
      url: new URL(href, page.url()).href,
    });
  }

  return links.filter((link) => {
    try {
      assertAllowedUrl(link.url, allowedHosts);
      return link.text.length > 0;
    } catch {
      return false;
    }
  });
}

async function firstMetaContent(page: Page, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    const meta = page.locator(selector).first();
    if ((await meta.count()) === 0) continue;
    const value = (await meta.getAttribute('content'))?.trim();
    if (value) return value;
  }
  return null;
}

function normalizeVisibleText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \u00a0]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeDateMetadata(value: string | null): string | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}
