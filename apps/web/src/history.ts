export type Topic = 'deadline' | 'format' | 'late' | 'unknown';
export type Run = { id: string; question: string; topic: Topic; status: 'running' | 'done' | 'cancelled'; step: number; createdAt: number };
export type Preferences = { motion: 'slide' | 'page' | 'none'; follow: boolean };
export const HISTORY_KEY = 'allabout.inquiries.v2';
export const SETTINGS_KEY = 'allabout.preferences.v2';
export function readHistory(): Run[] {
 try {
  const value: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  if (!Array.isArray(value)) return [];
  return value.filter((r): r is Run => !!r && typeof r === 'object' && typeof r.id === 'string' && typeof r.question === 'string' && r.question.length <= 2000 && ['deadline','format','late','unknown'].includes(r.topic) && ['running','done','cancelled'].includes(r.status) && Number.isFinite(r.createdAt) && Number.isInteger(r.step) && r.step >= 0 && r.step <= 5).slice(0,40).map(r=>({...r,status:r.status==='running'?'cancelled':r.status}));
 } catch { return []; }
}
export function readPreferences(): Preferences {
 try { const p=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');return {motion:['slide','page','none'].includes(p?.motion)?p.motion:'slide',follow:p?.follow!==false}; }
 catch { return {motion:'slide',follow:true}; }
}
export function classify(question:string): Topic {
 if (/late|迟交/i.test(question)) return 'late';
 if (/format|pdf|格式/i.test(question)) return 'format';
 if (/deadline|due|extend|截止|延期/i.test(question)) return 'deadline';
 return 'unknown';
}
export function visitedSources(run: Run | null): number {
 if (!run || run.topic === 'unknown') return 0;
 return Math.min(3, Math.max(0, run.step));
}
