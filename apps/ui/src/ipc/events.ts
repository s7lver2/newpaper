import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { TabPageEvent, TabShortcutEvent, TabsSnapshot } from './types';

export type { UnlistenFn };

export const onTabsChanged = (cb: (s: TabsSnapshot) => void) => listen<TabsSnapshot>('tabs://changed', (e) => cb(e.payload));
export const onTabPage = (cb: (e: TabPageEvent) => void) => listen<TabPageEvent>('tab://page', (e) => cb(e.payload));
export const onTabShortcut = (cb: (e: TabShortcutEvent) => void) => listen<TabShortcutEvent>('tab://shortcut', (e) => cb(e.payload));
export const onSettingsChanged = (cb: (e: { key: string; value: unknown }) => void) =>
  listen<{ key: string; value: unknown }>('settings://changed', (e) => cb(e.payload));
