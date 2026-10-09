import type { IngestReport, Watch } from './types';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { PrivacyStatus, TabPageEvent, TabShortcutEvent, TabsSnapshot } from './types';

export type { UnlistenFn };

export const onTabsChanged = (cb: (s: TabsSnapshot) => void) => listen<TabsSnapshot>('tabs://changed', (e) => cb(e.payload));
export const onTabPage = (cb: (e: TabPageEvent) => void) => listen<TabPageEvent>('tab://page', (e) => cb(e.payload));
export interface TabTransitionEvent { tabId: number; phase: 'start' | 'ready' | 'end'; image: string | null }
export const onTabTransition = (cb: (e: TabTransitionEvent) => void) => listen<TabTransitionEvent>('tab://transition', (e) => cb(e.payload));
export interface ContextMenuEvent {
  tabId: number;
  kind: 'page' | 'image' | 'selection' | 'audio' | 'video';
  link: string | null;
  source: string | null;
  selection: string | null;
  editable: boolean;
  pageUrl: string;
  x: number;
  y: number;
  image: string | null;
}
export const onContextMenu = (cb: (e: ContextMenuEvent) => void) => listen<ContextMenuEvent>('tab://context-menu', (e) => cb(e.payload));
export interface ResourceEvent {
  level: 'warn' | 'ok';
  usedMib: number;
  limitMib: number;
  totalMib: number;
  closable: { tabId: number; title: string }[];
}
export const onResources = (cb: (e: ResourceEvent) => void) => listen<ResourceEvent>('app://resources', (e) => cb(e.payload));
export const onTabShortcut = (cb: (e: TabShortcutEvent) => void) => listen<TabShortcutEvent>('tab://shortcut', (e) => cb(e.payload));
export const onSettingsChanged = (cb: (e: { key: string; value: unknown }) => void) =>
  listen<{ key: string; value: unknown }>('settings://changed', (e) => cb(e.payload));

export const onNetStatus = (cb: (s: PrivacyStatus) => void) => listen<PrivacyStatus>('net://status', (e) => cb(e.payload));
export const onAdblockBlocked = (cb: (e: { tabId: number; tabCount: number }) => void) =>
  listen<{ tabId: number; tabCount: number }>('adblock://blocked', (e) => cb(e.payload));
export const onAdblockCounts = (cb: (e: { tabs: Record<string, number>; today: number }) => void) =>
  listen<{ tabs: Record<string, number>; today: number }>('adblock://counts', (e) => cb(e.payload));

export const onFeedsUpdated = (cb: (r: IngestReport) => void) => listen<IngestReport>('feeds://updated', (e) => cb(e.payload));
export const onWatchFulfilled = (cb: (w: Watch) => void) => listen<Watch>('feeds://watch-fulfilled', (e) => cb(e.payload));
export const onOfflineBuildRequested = (cb: (e: { date: string }) => void) =>
  listen<{ date: string }>('offline://build-requested', (e) => cb(e.payload));
