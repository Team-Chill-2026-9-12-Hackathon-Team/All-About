export const SOURCE_FALLBACKS: Record<string, string> = {
  'reddit-uoft-csc207': 'https://old.reddit.com/r/UofT/',
  'reddit-uoft': 'https://old.reddit.com/r/UofT/',
  'hart-house-events': 'https://www.utoronto.ca/events',
  'artsci-academic-dates': 'https://artsci.calendar.utoronto.ca/sessional-dates',
  'artsci-exam-conflicts': 'https://artsci.calendar.utoronto.ca/sessional-dates',
  'ulife-organizations': 'https://www.studentlife.utoronto.ca/events/',
};

const FALLBACK_CODES = new Set(['ACCESS_BLOCKED', 'NO_MATCH', 'NAVIGATION_FAILED', 'TIMEOUT']);

export function fallbackUrlFor(sourceId: string, currentUrl: string): string | null {
  const fallback = SOURCE_FALLBACKS[sourceId];
  if (!fallback || fallback === currentUrl) return null;
  return fallback;
}

export function shouldUseFallback(code: string): boolean {
  return FALLBACK_CODES.has(code);
}
