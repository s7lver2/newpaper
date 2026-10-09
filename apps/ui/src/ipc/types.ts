import type { Article, ListingItem, NewsSignals, ShortcutAction } from '@newpaper/extract';

export type { ShortcutAction };
export type TabId = number;
export type TabKind = 'web' | 'internal';
export type TabView = 'original' | 'reader';

export interface TabGroup { id: number; name: string; color: 'blue' | 'green' | 'amber' | 'rose' | 'violet' | 'teal'; collapsed: boolean }
export const GROUP_COLORS = ['blue', 'green', 'amber', 'rose', 'violet', 'teal'] as const;

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
  /** Readability extrajo un artículo: el lector se puede abrir a mano aunque no sea noticia. */
  readable: boolean;
  /** Se espera a saber si la página abre el lector (la original sigue oculta; la UI muestra su carga). */
  readerPending?: boolean;
  failure: NavFailure | null;
  crashed: boolean;
  /** Anclada: va al principio, solo con icono y sin grupo. */
  pinned?: boolean;
  group?: number | null;
}

export interface TabsSnapshot { tabs: TabInfo[]; activeId: TabId | null; groups?: TabGroup[] }

export interface PageArticle extends Article {
  type: 'page';
  article: boolean;
  signals: NewsSignals;
  /** `listing`: portada, sección o búsqueda (selector de artículos). */
  kind: 'article' | 'listing' | 'other';
  items: ListingItem[];
}
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

export type NetMode = 'direct' | 'tor';
export type TorState =
  | { state: 'off' }
  | { state: 'bootstrapping'; percent: number }
  | { state: 'ready' }
  | { state: 'failed'; message: string };
export interface PrivacyStatus {
  mode: NetMode;
  tor: TorState;
  socksPort: number;
  exitCountry: string | null;
  circuit: number;
  aiViaTor: boolean;
  feedsViaTor: boolean;
  killSwitchActive: boolean;
  tabsWithoutTor: number[];
}
export type ListCategory = 'ads' | 'privacy' | 'cookies' | 'newsletters';
export interface FilterListStatus { id: string; name: string; category: ListCategory; enabled: boolean; source: 'downloaded' | 'embedded'; fetchedAt: number | null }
export interface AdblockStatus { enabled: boolean; lists: FilterListStatus[]; lastRefresh: number | null }
export interface RefreshReport { updated: string[]; failed: [string, string][]; skipped: boolean }
export interface BlockedCounts { tab: number; today: number }

export function isCmdError(e: unknown): e is CmdError {
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e;
}
export type Bucket = 'left' | 'center' | 'right' | 'unknown';
export interface Coverage { outletId: string; outlet: string; url: string; title: string; lean: number | null; leanUncertainty: number | null; bucket: Bucket; publishedAt: number }
export interface CoverageResult { eventId: number | null; coverages: Coverage[]; outletCount: number; searched: boolean; searchSkipped: 'no_key' | 'network' | null; enough: boolean }
export interface EventCard { eventId: number; title: string; outletCount: number; leanMix: [number, number, number]; latestAt: number; topic: string | null }
export interface EventDetail { card: EventCard; articles: Coverage[] }
export interface LeanEstimate { value: number; uncertainty: number; own: number | null; ownN: number; audience: number | null; external: number | null; weights: [number, number, number] }
export interface OutletLean {
  outletId: string; name: string; domain: string; language: string; kind: string;
  estimate: LeanEstimate | null; byTopic: { topic: string; mean: number; n: number }[];
  reliability: { ratio: number; n: number } | null; overrideLean: number | null; overrideNote: string | null;
  effective: number | null; effectiveUncertainty: number | null;
}
export interface TopicState { id: string; name: string; following: boolean; newCount: number }
export interface Watch { id: string; articleUrl: string | null; query: string | null; eventId: number | null; createdAt: number; fulfilledAt: number | null }
export interface LexiconScore { status: 'ok' | 'insufficient' | 'unavailable'; value: number | null; confidence: number; matches: { phrase: string; weight: number; start: number; end: number }[] }
export interface CustomOutlet { name: string; domain: string; feeds: string[]; language: string; country: string }
export interface CdxRow { timestamp: string; digest: string; status: number }
export interface CaptureText { headline: string; paragraphs: string[] }
export interface CaptureInput { timestamp: string; digest: string; text: CaptureText }
export type EditKind = 'titular' | 'dato' | 'parrafo_anadido' | 'parrafo_eliminado' | 'texto';
export interface CaptureEdit { captureIndex: number; kind: EditKind; before: string | null; after: string | null }
export interface WaybackHistory { url: string; captures: CaptureInput[]; edits: CaptureEdit[]; editedCaptures: number; silent: boolean; notice: string | null }
export interface DiffOp { kind: 'eq' | 'ins' | 'del'; text: string }
export interface TextDiff { headline: DiffOp[]; paragraphs: { kind: EditKind | null; ops: DiffOp[] }[] }
export interface IngestReport { feedsOk: number; feedsNotModified: number; feedsFailed: number; inserted: number; assigned: number; newEvents: number }
export interface SavedArticle { url: string; title: string; outlet: string | null; articleJson: string; savedAt: number }
export interface Edition { id: string; date: string; createdAt: number; bytes: number; status: 'building' | 'ready'; articleCount: number; summaryJson: string }
export interface OfflineArticle { url: string; title: string; outlet: string | null; articleJson: string; analysisJson: string | null }
export interface OfflineHit { kind: 'saved' | 'edition'; reference: string; title: string }
export interface BeginResult { editionId: string; candidates: { url: string; title: string; outlet: string | null; topic: string | null }[]; summaryJson: string }
export interface OfflineSettings { enabled: boolean; time: string; wifiOnly: boolean; acOnly: boolean; articles: number; maxMb: number; expiryDays: number }
