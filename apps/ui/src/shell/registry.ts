import type { ComponentType } from 'react';
import type { PageArticle, ShortcutAction, TabInfo } from '../ipc/types';
import type { InternalUrl } from './internalUrl';

export interface InternalPageProps { url: InternalUrl; tab: TabInfo }
export interface SettingsSection { id: string; order: number; titleKey: string; descriptionKey?: string; Component: ComponentType }
export interface ToolbarItem { id: string; order: number; Component: ComponentType<{ tab: TabInfo | null }> }
export type TabSurfaceKind = 'error' | 'crash';
export interface ReaderSurfaceProps { tab: TabInfo; page: PageArticle }
export interface Overlay { id: string; Component: ComponentType }
export interface ShortcutContext { tab: TabInfo | null; selection: string }

let pages = new Map<string, ComponentType<InternalPageProps>>();
let sections = new Map<string, SettingsSection>();
let toolbar = new Map<string, ToolbarItem>();
let surfaces = new Map<TabSurfaceKind, ComponentType<{ tab: TabInfo }>>();
let reader: ComponentType<ReaderSurfaceProps> | undefined;
let overlayMap = new Map<string, Overlay>();
let shortcuts = new Map<ShortcutAction, (ctx: ShortcutContext) => void>();

export const registerInternalPage = (page: string, C: ComponentType<InternalPageProps>) => void pages.set(page, C);
export const resolveInternalPage = (page: string) => pages.get(page);

export const registerSettingsSection = (s: SettingsSection) => void sections.set(s.id, s);
export const settingsSections = () => [...sections.values()].sort((a, b) => a.order - b.order);

export const registerToolbarItem = (t: ToolbarItem) => void toolbar.set(t.id, t);
export const toolbarItems = () => [...toolbar.values()].sort((a, b) => a.order - b.order);

export const registerTabSurface = (kind: TabSurfaceKind, C: ComponentType<{ tab: TabInfo }>) => void surfaces.set(kind, C);
export const tabSurface = (kind: TabSurfaceKind) => surfaces.get(kind);

export const registerReaderView = (C: ComponentType<ReaderSurfaceProps>) => {
  reader = C;
};
export const readerView = () => reader;

export const registerOverlay = (o: Overlay) => void overlayMap.set(o.id, o);
export const overlays = () => [...overlayMap.values()];

export const registerShortcut = (action: ShortcutAction, handler: (ctx: ShortcutContext) => void) => void shortcuts.set(action, handler);
export const shortcutHandler = (action: ShortcutAction) => shortcuts.get(action);

export function _resetRegistry(): void {
  pages = new Map();
  sections = new Map();
  toolbar = new Map();
  surfaces = new Map();
  reader = undefined;
  overlayMap = new Map();
  shortcuts = new Map();
}
