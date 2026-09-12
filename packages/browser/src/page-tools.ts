import type { Page } from 'playwright';

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

  const hosts = new Set(allowedHosts.map((host) => host.trim().toLowerCase()));
  if (!hosts.has(url.hostname.toLowerCase())) {
    throw new Error(`Host ${url.hostname} is not registered for this source.`);
  }

  return url;
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

  const dates = await page.evaluate(() => {
    const content = (selectors: string[]): string | null => {
      for (const selector of selectors) {
        const value = document.querySelector<HTMLMetaElement>(selector)?.content?.trim();
        if (value) return value;
      }
      return null;
    };

    return {
      publishedAt: content([
        'meta[property="article:published_time"]',
        'meta[name="datePublished"]',
        'meta[itemprop="datePublished"]',
      ]),
      updatedAt: content([
        'meta[property="article:modified_time"]',
        'meta[name="dateModified"]',
        'meta[itemprop="dateModified"]',
      ]),
    };
  });

  return {
    title: (await page.title()).trim(),
    text,
    publishedAt: normalizeDateMetadata(dates.publishedAt),
    updatedAt: normalizeDateMetadata(dates.updatedAt),
  };
}

export async function readLinks(page: Page, allowedHosts: string[]): Promise<VisibleLink[]> {
  const links = await page.locator('a[href]:visible').evaluateAll((anchors) =>
    anchors.slice(0, 200).map((anchor) => ({
      text: (anchor.textContent ?? '').replace(/\s+/g, ' ').trim(),
      url: (anchor as HTMLAnchorElement).href,
    })),
  );

  return links.filter((link) => {
    try {
      assertAllowedUrl(link.url, allowedHosts);
      return link.text.length > 0;
    } catch {
      return false;
    }
  });
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
