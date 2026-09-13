import type { Page } from 'playwright';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PageReadResult } from './page-tools.js';

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const task = getDocument({data: bytes, useSystemFonts: true});
  try {
    const document = await task.promise;
    const pages: string[] = [];
    for (let i = 1; i <= Math.min(document.numPages, 100); i++) {
      const content = await (await document.getPage(i)).getTextContent();
      pages.push(content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join(''));
    }
    return pages.join('\n\n').trim();
  } finally {
    await task.destroy();
  }
}

export async function readCanvasFile(page: Page): Promise<PageReadResult | null> {
  const url = new URL(page.url());
  const match = url.pathname.match(/^\/courses\/(\d+)\/files\/(\d+)/);
  if (url.hostname !== 'q.utoronto.ca' || !match) return null;
  const metadataResponse = await page.request.get(`${url.origin}/api/v1/courses/${match[1]}/files/${match[2]}`, {timeout: 15000});
  if (!metadataResponse.ok()) throw new Error('The Quercus file metadata could not be read.');
  const metadata = await metadataResponse.json();
  const download = new URL(metadata.url);
  if (download.protocol !== 'https:' || !(download.hostname === 'q.utoronto.ca' || download.hostname.endsWith('.instructure.com') || download.hostname.endsWith('.canvas-user-content.com'))) {
    throw new Error('The syllabus download host is not supported.');
  }
  if (metadata.size > 25 * 1024 * 1024) throw new Error('The syllabus PDF exceeds the 25 MB reading limit.');
  const response = await page.request.get(download.href, {timeout: 30000});
  if (!response.ok()) throw new Error('The syllabus file download failed.');
  const bytes = await response.body();
  if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('The linked syllabus file is not a supported PDF.');
  const text = await extractPdfText(new Uint8Array(bytes));
  if (text.length < 100) throw new Error('The syllabus PDF has no readable text; it may require OCR.');
  return {title: metadata.display_name || metadata.filename || 'Course syllabus PDF', text, publishedAt: null, updatedAt: metadata.updated_at ?? null};
}
