import { beforeEach, describe, expect, it } from 'vitest';
import type { TabInfo, TabPageEvent } from '../ipc/types';
import { applyPage, applySnapshot, browserStore, resetBrowserStore } from './browser';

const tab = (id: number, url: string, extra: Partial<TabInfo> = {}): TabInfo => ({
  id, url, title: '', kind: url.startsWith('newpaper://') ? 'internal' : 'web', private: false, loading: false,
  canGoBack: false, canGoForward: false, view: 'original', isNews: false, failure: null, crashed: false, ...extra,
});
const page = (tabId: number, url: string): TabPageEvent => ({
  tabId, isNews: true,
  article: { type: 'page', article: true, url, title: 'T', byline: null, siteName: null, published: null, lang: 'es', html: '<p>x</p>', text: 'x', excerpt: null, signals: { ogType: 'article', jsonLdTypes: [] } },
});

describe('browser store', () => {
  beforeEach(() => resetBrowserStore());

  it('stores snapshots and pages per tab', () => {
    applySnapshot({ tabs: [tab(1, 'https://a.example/x')], activeId: 1 });
    applyPage(page(1, 'https://a.example/x'));
    expect(browserStore.get().snapshot.activeId).toBe(1);
    expect(browserStore.get().pages[1]?.article.title).toBe('T');
  });

  it('drops pages of closed tabs and of tabs that navigated elsewhere', () => {
    applySnapshot({ tabs: [tab(1, 'https://a.example/x'), tab(2, 'https://b.example/')], activeId: 1 });
    applyPage(page(1, 'https://a.example/x'));
    applyPage(page(2, 'https://b.example/'));
    applySnapshot({ tabs: [tab(1, 'https://a.example/y')], activeId: 1 });
    expect(browserStore.get().pages).toEqual({});
  });

  it('keeps the page when only the fragment changes', () => {
    applySnapshot({ tabs: [tab(1, 'https://a.example/x')], activeId: 1 });
    applyPage(page(1, 'https://a.example/x'));
    applySnapshot({ tabs: [tab(1, 'https://a.example/x#c')], activeId: 1 });
    expect(browserStore.get().pages[1]).toBeDefined();
  });
});
