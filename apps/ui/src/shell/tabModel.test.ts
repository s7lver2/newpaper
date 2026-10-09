import { describe, expect, it } from 'vitest';
import type { TabGroup, TabInfo } from '../ipc/types';
import { filterTabs, segments } from './tabModel';

const tab = (id: number, extra: Partial<TabInfo> = {}): TabInfo => ({
  id, url: `https://s${id}.example/`, title: `Título ${id}`, kind: 'web', private: false, loading: false, canGoBack: false, canGoForward: false,
  view: 'original', isNews: false, readable: false, failure: null, crashed: false, pinned: false, group: null, ...extra,
});
const g = (id: number, extra: Partial<TabGroup> = {}): TabGroup => ({ id, name: `G${id}`, color: 'blue', collapsed: false, ...extra });

describe('segments', () => {
  it('splits pinned, grouped and loose tabs into consecutive blocks', () => {
    const s = segments([tab(1, { pinned: true }), tab(2, { group: 1 }), tab(3, { group: 1 }), tab(4), tab(5, { group: 2 }), tab(6)], [g(1), g(2)]);
    expect(s.map((x) => [x.kind, x.tabs.map((t) => t.id)])).toEqual([
      ['pinned', [1]], ['group', [2, 3]], ['loose', [4]], ['group', [5]], ['loose', [6]],
    ]);
  });
  it('treats a tab pointing to an unknown group as loose', () => {
    expect(segments([tab(1, { group: 9 })], []).map((x) => x.kind)).toEqual(['loose']);
  });
});

describe('filterTabs', () => {
  it('matches title or address without accents or case', () => {
    const tabs = [tab(1, { title: 'Economía hoy' }), tab(2, { url: 'https://elpais.com/x' }), tab(3)];
    expect(filterTabs(tabs, 'ECONOMIA').map((t) => t.id)).toEqual([1]);
    expect(filterTabs(tabs, 'elpais').map((t) => t.id)).toEqual([2]);
    expect(filterTabs(tabs, '  ')).toHaveLength(3);
  });
});
