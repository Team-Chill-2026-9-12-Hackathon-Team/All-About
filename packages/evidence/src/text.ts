export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function quoteExists(quote: string, pageText: string): boolean {
  return normalizeText(pageText).includes(normalizeText(quote));
}
