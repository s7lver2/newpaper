import { Channel, invoke } from '@tauri-apps/api/core';
import type { AiInvoker, ProxyEvent, ProxyRequest } from '@newpaper/pipeline';

// Tipos copiados de apps/ui/src/ipc/types.ts (la app móvil no importa el escritorio).
export type Bucket = 'left' | 'center' | 'right' | 'unknown';
export interface Coverage { outletId: string; outlet: string; url: string; title: string; lean: number | null; leanUncertainty: number | null; bucket: Bucket; publishedAt: number }
export interface CoverageResult { eventId: number | null; coverages: Coverage[]; outletCount: number; searched: boolean; searchSkipped: 'no_key' | 'network' | null; enough: boolean }
export interface EventCard { eventId: number; title: string; outletCount: number; leanMix: [number, number, number]; latestAt: number; topic: string | null }
export interface EventDetail { card: EventCard; articles: Coverage[] }
export type SearchSource = 'bar' | 'coverage' | 'hemeroteca';
export interface HistoryEntry { id: string; kind: 'visit' | 'search'; url: string | null; title: string | null; outlet: string | null; query: string | null; source: SearchSource | null; analyzed: boolean; at: number }
export interface HistoryFilter { text?: string; kind?: 'visit' | 'search' | 'analysis'; outlet?: string; from?: number; to?: number; limit?: number }
export interface SavedArticle { url: string; title: string; outlet: string | null; articleJson: string; savedAt: number }
export interface LexiconScore { status: 'ok' | 'insufficient' | 'unavailable'; value: number | null; confidence: number; matches: { phrase: string; weight: number; start: number; end: number }[] }
export interface CachedStage { json: string; model: string | null; cost: number; createdAt: number }
export interface MonthUsage { month: string; cost: number; inputTokens: number; outputTokens: number }
/** Igual que `np_ai_proxy::CustomEndpoint`. La clave nunca llega a la webview. */
export interface CustomEndpoint { id: string; baseUrl: string; auth: 'bearer' | 'x_api_key' | 'x_goog_api_key' | 'none'; local: boolean }
export interface PeerView { id: string; name: string; publicKey: string; addresses: string[]; scopes: string[]; sendKeys: boolean; pairedAt: number; lastSyncAt: number | null; revoked: boolean; fingerprint: string; lastError: string | null }
export interface SyncReport { peerId: string; peerName: string; sent: number; received: number; applied: number; keys: number; paired: boolean }
export interface OllamaProbe { base: string; models: string[] }
export interface OriginalLabels { close: string; analyze: string }

/** Envoltorios de los comandos que usa el móvil (todos existen en el bloque `#[cfg(mobile)]` de src-tauri/src/lib.rs). */
export const ipc = {
  settingsGet: <T>(key: string) => invoke<T | null>('settings_get', { key }),
  settingsSet: (key: string, value: unknown) => invoke<void>('settings_set', { key, value }),
  configRead: (name: string) => invoke<string>('config_read', { name }),
  secretSet: (key: string, value: string) => invoke<void>('secret_set', { key, value }),
  historyRecordVisit: (url: string, title: string) => invoke<string | null>('history_record_visit', { url, title }),
  historySearch: (filter: HistoryFilter) => invoke<HistoryEntry[]>('history_search', { filter }),
  historyMarkAnalyzed: (url: string) => invoke<number>('history_mark_analyzed', { url }),
  eventsBriefing: (limit?: number) => invoke<EventCard[]>('events_briefing', { limit }),
  eventsSearch: (query: string) => invoke<EventCard[]>('events_search', { query }),
  eventDetail: (eventId: number) => invoke<EventDetail | null>('event_detail', { eventId }),
  coverageFor: (url: string, title: string, excerpt?: string) => invoke<CoverageResult>('coverage_for', { url, title, excerpt }),
  lexiconScore: (text: string, locale: string) => invoke<LexiconScore>('lexicon_score', { text, locale }),
  savedList: () => invoke<SavedArticle[]>('saved_list'),
  savedAdd: (article: SavedArticle) => invoke<void>('saved_add', { article }),
  watchAdd: (w: { articleUrl?: string; query?: string; eventId?: number }) => invoke<string>('watch_add', w),
  sourceFetch: (url: string, allowExtra: string[]) => invoke<string>('source_fetch', { url, allowExtra }),
  analysisCacheGet: (url: string, textHash: string, stage: string) => invoke<CachedStage | null>('analysis_cache_get', { url, textHash, stage }),
  analysisCachePut: (url: string, textHash: string, stage: string, json: string, model: string | null, cost: number) =>
    invoke<void>('analysis_cache_put', { url, textHash, stage, json, model, cost }),
  usageRecord: (provider: string, model: string, inputTokens: number, outputTokens: number, cost: number) =>
    invoke<void>('usage_record', { provider, model, inputTokens, outputTokens, cost }),
  usageMonth: () => invoke<MonthUsage>('usage_month', {}),
  aiCancel: (requestId: string) => invoke<boolean>('ai_cancel', { requestId }),
  syncPairWith: (code: string) => invoke<PeerView>('sync_pair_with', { code }),
  syncPeers: () => invoke<PeerView[]>('sync_peers'),
  syncNow: () => invoke<SyncReport[]>('sync_now', {}),
  fetchPage: (url: string) => invoke<string>('mobile_fetch_page', { url }),
  pendingShare: () => invoke<string | null>('mobile_pending_share'),
  originalOpen: (url: string, labels: OriginalLabels) => invoke<void>('mobile_original_open', { url, labels }),
  originalClose: () => invoke<void>('mobile_original_close'),
  ollamaProbe: (url: string) => invoke<OllamaProbe>('mobile_ollama_probe', { url }),
  /** El comando Rust solo recibe la base: el propio Rust guarda el endpoint `ollama` en `ai.customEndpoints`. */
  usePcOllama: (base: string) => invoke<void>('mobile_use_pc_ollama', { base }),
};

/** Mismo puerto que el escritorio (apps/ui/src/features/ai/tauriPorts.ts), sobre `ai_fetch`. */
export const aiInvoker: AiInvoker = {
  async fetch(provider: string, request: ProxyRequest, onEvent: (e: ProxyEvent) => void) {
    const ch = new Channel<ProxyEvent>();
    ch.onmessage = onEvent;
    await invoke('ai_fetch', { provider, request, onEvent: ch });
  },
  cancel: (requestId: string) => ipc.aiCancel(requestId),
};
