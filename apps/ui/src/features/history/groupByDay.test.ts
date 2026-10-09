import { describe, expect, it } from 'vitest';
import type { HistoryEntry } from '../../ipc/types';
import { groupByDay, rangeFor } from './groupByDay';

const e = (id: string, at: Date): HistoryEntry => ({ id, kind: 'visit', url: `https://d.example/${id}`, title: id, outlet: null, query: null, source: null, analyzed: false, at: at.getTime() });

describe('groupByDay', () => {
  it('groups by local calendar day, newest first, with today and yesterday', () => {
    const now = new Date(2026, 9, 8, 10, 0);
    const groups = groupByDay(
      [e('a', new Date(2026, 9, 8, 0, 5)), e('b', new Date(2026, 9, 7, 23, 59)), e('c', new Date(2026, 9, 8, 9, 0)), e('d', new Date(2026, 8, 30, 12, 0))],
      now,
    );
    expect(groups.map((g) => [g.key, g.kind, g.items.map((i) => i.id)])).toEqual([
      ['2026-10-08', 'today', ['c', 'a']],
      ['2026-10-07', 'yesterday', ['b']],
      ['2026-09-30', 'date', ['d']],
    ]);
  });

  it('computes deletion ranges in local time', () => {
    const now = new Date(2026, 9, 8, 10, 30);
    expect(rangeFor('today', now)).toEqual({ from: new Date(2026, 9, 8).getTime(), to: now.getTime() });
    expect(rangeFor('hour', now).from).toBe(now.getTime() - 3_600_000);
    expect(rangeFor('week', now).from).toBe(new Date(2026, 9, 1, 10, 30).getTime());
  });
});
