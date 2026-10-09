import type { HistoryEntry } from '../../ipc/types';

export interface DayGroup { key: string; kind: 'today' | 'yesterday' | 'date'; date: Date; items: HistoryEntry[] }

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function groupByDay(entries: HistoryEntry[], now: Date): DayGroup[] {
  const today = dayKey(now);
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterday = dayKey(y);
  const map = new Map<string, DayGroup>();
  for (const it of [...entries].sort((a, b) => b.at - a.at)) {
    const d = new Date(it.at);
    const key = dayKey(d);
    let g = map.get(key);
    if (!g) {
      g = { key, kind: key === today ? 'today' : key === yesterday ? 'yesterday' : 'date', date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), items: [] };
      map.set(key, g);
    }
    g.items.push(it);
  }
  return [...map.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
}

export function rangeFor(kind: 'hour' | 'today' | 'week', now: Date): { from: number; to: number } {
  const to = now.getTime();
  if (kind === 'hour') return { from: to - 3_600_000, to };
  if (kind === 'today') return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), to };
  return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()).getTime(), to };
}
