import { commands } from '../ipc/commands';
import { onTabPage, onTabsChanged } from '../ipc/events';
import type { TabId, TabInfo, TabPageEvent, TabsSnapshot } from '../ipc/types';
import { createStore } from './store';

interface BrowserState {
  snapshot: TabsSnapshot;
  pages: Record<TabId, TabPageEvent>;
}

const EMPTY: BrowserState = { snapshot: { tabs: [], activeId: null }, pages: {} };
export const browserStore = createStore<BrowserState>(EMPTY);

export function resetBrowserStore(): void {
  browserStore.set(() => EMPTY);
}

const noHash = (u: string) => u.split('#')[0];

export function applySnapshot(snapshot: TabsSnapshot): void {
  browserStore.set((prev) => {
    const pages: Record<TabId, TabPageEvent> = {};
    for (const t of snapshot.tabs) {
      const p = prev.pages[t.id];
      if (p && noHash(p.article.url) === noHash(t.url)) pages[t.id] = p;
    }
    return { snapshot, pages };
  });
}

export function applyPage(e: TabPageEvent): void {
  browserStore.set((prev) => ({ ...prev, pages: { ...prev.pages, [e.tabId]: e } }));
}

/** Arranca la sincronización con Rust; abre una pestaña nueva si no hay ninguna. */
export async function startBrowserSync(): Promise<() => void> {
  const offTabs = await onTabsChanged(applySnapshot);
  const offPage = await onTabPage(applyPage);
  const snap = await commands.tabsSnapshot();
  applySnapshot(snap);
  if (snap.tabs.length === 0) await commands.tabOpen();
  return () => {
    offTabs();
    offPage();
  };
}

export const useBrowser = <S>(selector: (s: BrowserState) => S) => browserStore.use(selector);
export const useActiveTabId = () => useBrowser((s) => s.snapshot.activeId);
export const useActiveTab = (): TabInfo | null =>
  useBrowser((s) => s.snapshot.tabs.find((t) => t.id === s.snapshot.activeId) ?? null);
export const useArticle = (tabId: TabId | null) => useBrowser((s) => (tabId === null ? undefined : s.pages[tabId]));
