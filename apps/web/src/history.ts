export type Preferences = { motion: 'slide' | 'page' | 'none'; follow: boolean };
export const SETTINGS_KEY = 'allabout.preferences.v2';
export const HISTORY_KEY = 'allabout.inquiries.v3';

export type HistoryItem = {
  id: string;
  question: string;
  status: string;
  mode: string;
  createdAt: number;
};

export function readHistory(): HistoryItem[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (r): r is HistoryItem =>
          !!r &&
          typeof r === 'object' &&
          typeof r.id === 'string' &&
          typeof r.question === 'string' &&
          r.question.length <= 2000 &&
          typeof r.status === 'string' &&
          typeof r.mode === 'string' &&
          Number.isFinite(r.createdAt),
      )
      .slice(0, 40);
  } catch {
    return [];
  }
}

export function readPreferences(): Preferences {
  try {
    const p = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      motion: ['slide', 'page', 'none'].includes(p?.motion) ? p.motion : 'slide',
      follow: p?.follow !== false,
    };
  } catch {
    return { motion: 'slide', follow: true };
  }
}
