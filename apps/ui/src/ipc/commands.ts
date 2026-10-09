import { invoke } from '@tauri-apps/api/core';
import type {
  AdblockStatus, BlockedCounts, DeleteScope, HistoryEntry, HistoryFilter, NetMode, PrivacyStatus, Rect, RefreshReport,
  SearchSource, Suggestion, TabId, TabInfo, TabsSnapshot, TabView,
} from './types';

/** Único punto de la UI que conoce los nombres de los comandos Rust. Los subproyectos añaden entradas. */
export const commands = {
  tabOpen: (args: { url?: string; private?: boolean; activate?: boolean; openerId?: TabId } = {}) => invoke<TabInfo>('tab_open', args),
  tabClose: (tabId: TabId) => invoke<void>('tab_close', { tabId }),
  tabActivate: (tabId: TabId) => invoke<void>('tab_activate', { tabId }),
  tabNavigate: (tabId: TabId, input: string) => invoke<void>('tab_navigate', { tabId, input }),
  tabBack: (tabId: TabId) => invoke<void>('tab_back', { tabId }),
  tabForward: (tabId: TabId) => invoke<void>('tab_forward', { tabId }),
  tabReload: (tabId: TabId) => invoke<void>('tab_reload', { tabId }),
  tabSetView: (tabId: TabId, view: TabView) => invoke<void>('tab_set_view', { tabId, view }),
  tabSetBounds: (rect: Rect) => invoke<void>('tab_set_bounds', { rect }),
  tabPin: (tabId: TabId, pinned: boolean) => invoke<void>('tab_pin', { tabId, pinned }),
  tabGroup: (tabIds: TabId[], opts: { name?: string; groupId?: number } = {}) => invoke<number | null>('tab_group', { tabIds, name: opts.name, groupId: opts.groupId }),
  tabUngroup: (tabId: TabId) => invoke<void>('tab_ungroup', { tabId }),
  tabGroupUpdate: (groupId: number, u: { name?: string; color?: string; collapsed?: boolean }) =>
    invoke<void>('tab_group_update', { groupId, name: u.name, color: u.color, collapsed: u.collapsed }),
  tabCloseGroup: (groupId: number) => invoke<void>('tab_close_group', { groupId }),
  tabsSnapshot: () => invoke<TabsSnapshot>('tabs_snapshot'),
  overlayOpen: (tabId: TabId) => invoke<string | null>('overlay_open', { tabId }),
  ctxClose: (tabId: TabId) => invoke<void>('ctx_close', { tabId }),
  ctxEdit: (tabId: TabId, action: 'delete' | 'paste' | 'selectAll', text?: string) => invoke<void>('ctx_edit', { tabId, action, text }),
  clipboardText: () => invoke<string | null>('clipboard_text'),
  chromeSetMotion: (reduced: boolean) => invoke<void>('chrome_set_motion', { reduced }),
  chromeSetTheme: (theme: 'paper' | 'ink') => invoke<void>('chrome_set_theme', { theme }),

  settingsGet: <T = unknown>(key: string) => invoke<T | null>('settings_get', { key }),
  settingsSet: (key: string, value: unknown) => invoke<void>('settings_set', { key, value }),
  settingsList: (prefix: string) => invoke<[string, unknown][]>('settings_list', { prefix }),

  historyRecordVisit: (tabId: TabId, url: string, title: string) => invoke<string | null>('history_record_visit', { tabId, url, title }),
  historyRecordSearch: (query: string, source: SearchSource) => invoke<string | null>('history_record_search', { query, source }),
  historyMarkAnalyzed: (url: string) => invoke<number>('history_mark_analyzed', { url }),
  historySearch: (filter: HistoryFilter) => invoke<HistoryEntry[]>('history_search', { filter }),
  historyDelete: (scope: DeleteScope) => invoke<number>('history_delete', { scope }),
  omniboxSuggest: (input: string) => invoke<Suggestion[]>('omnibox_suggest', { input }),

  secretSet: (key: string, value: string) => invoke<void>('secret_set', { key, value }),
  secretHas: (key: string) => invoke<boolean>('secret_has', { key }),
  secretDelete: (key: string) => invoke<void>('secret_delete', { key }),

  configRead: (name: string) => invoke<string>('config_read', { name }),

  privacyStatus: () => invoke<PrivacyStatus>('privacy_status'),
  netSetMode: (mode: NetMode) => invoke<PrivacyStatus>('net_set_mode', { mode }),
  torSetExitCountry: (country: string | null) => invoke<PrivacyStatus>('tor_set_exit_country', { country }),
  torNewCircuit: (tabId?: TabId) => invoke<PrivacyStatus>('tor_new_circuit', { tabId }),
  privacySetRouting: (r: { aiViaTor?: boolean; feedsViaTor?: boolean }) => invoke<PrivacyStatus>('privacy_set_routing', r),
  tabWithoutTor: (tabId: TabId) => invoke<PrivacyStatus>('tab_without_tor', { tabId }),
  adblockStatus: () => invoke<AdblockStatus>('adblock_status'),
  adblockSetEnabled: (enabled: boolean) => invoke<AdblockStatus>('adblock_set_enabled', { enabled }),
  adblockSetList: (id: string, enabled: boolean) => invoke<AdblockStatus>('adblock_set_list', { id, enabled }),
  adblockRefresh: () => invoke<RefreshReport>('adblock_refresh'),
  blockedCounts: (tabId?: TabId) => invoke<BlockedCounts>('blocked_counts', { tabId }),
};
