import type { Article, NewsSignals, ShortcutAction } from '@newpaper/extract';

export type { ShortcutAction };
export type TabId = number;
export type TabKind = 'web' | 'internal';
export type TabView = 'original' | 'reader';

export interface NavFailure { url: string; webErrorStatus: number; httpStatus: number | null }

export interface TabInfo {
  id: TabId;
  url: string;
  title: string;
  kind: TabKind;
  private: boolean;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  view: TabView;
  isNews: boolean;
  failure: NavFailure | null;
  crashed: boolean;
}

export interface TabsSnapshot { tabs: TabInfo[]; activeId: TabId | null }

export interface PageArticle extends Article { type: 'page'; article: boolean; signals: NewsSignals }
export interface TabPageEvent { tabId: TabId; article: PageArticle; isNews: boolean }
export interface TabShortcutEvent { tabId: TabId; action: ShortcutAction }

export type SearchSource = 'bar' | 'coverage' | 'hemeroteca';
export interface HistoryEntry {
  id: string;
  kind: 'visit' | 'search';
  url: string | null;
  title: string | null;
  outlet: string | null;
  query: string | null;
  source: SearchSource | null;
  analyzed: boolean;
  at: number;
}
export interface HistoryFilter { text?: string; kind?: 'visit' | 'search' | 'analysis'; outlet?: string; from?: number; to?: number; limit?: number }
export type DeleteScope =
  | { scope: 'range'; from: number; to: number }
  | { scope: 'outlet'; outlet: string }
  | { scope: 'all' }
  | { scope: 'one'; id: string };

export type SuggestionKind = 'go' | 'search' | 'history' | 'outlet' | 'recent';
export interface Suggestion { kind: SuggestionKind; label: string; value: string; detail: string | null }

export interface Rect { x: number; y: number; width: number; height: number }
export interface CmdError { code: string; message: string }

export function isCmdError(e: unknown): e is CmdError {
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e;
}
