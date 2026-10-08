import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { PrivacyStatus, TabPageEvent, TabShortcutEvent, TabsSnapshot } from './types';

export type { UnlistenFn };

export const onTabsChanged = (cb: (s: TabsSnapshot) => void) => listen<TabsSnapshot>('tabs://changed', (e) => cb(e.payload));
export const onTabPage = (cb: (e: TabPageEvent) => void) => listen<TabPageEvent>('tab://page', (e) => cb(e.payload));
export const onTabShortcut = (cb: (e: TabShortcutEvent) => void) => listen<TabShortcutEvent>('tab://shortcut', (e) => cb(e.payload));
export const onSettingsChanged = (cb: (e: { key: string; value: unknown }) => void) =>
  listen<{ key: string; value: unknown }>('settings://changed', (e) => cb(e.payload));

export const onNetStatus = (cb: (s: PrivacyStatus) => void) => listen<PrivacyStatus>('net://status', (e) => cb(e.payload));
export const onAdblockBlocked = (cb: (e: { tabId: number; tabCount: number }) => void) =>
  listen<{ tabId: number; tabCount: number }>('adblock://blocked', (e) => cb(e.payload));
export const onAdblockCounts = (cb: (e: { tabs: Record<string, number>; today: number }) => void) =>
  listen<{ tabs: Record<string, number>; today: number }>('adblock://counts', (e) => cb(e.payload));
