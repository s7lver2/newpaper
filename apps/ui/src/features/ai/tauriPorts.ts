import { Channel, invoke } from '@tauri-apps/api/core';
import { extractFromHtml } from '@newpaper/extract';
import type { AiInvoker, CacheStore, CoverageService, LexiconService, ProxyEvent, ProxyRequest, SourceFetcher, UsageSink } from '@newpaper/pipeline';
import { commands } from '../../ipc/commands';

export const tauriInvoker: AiInvoker = {
  async fetch(provider: string, request: ProxyRequest, onEvent: (e: ProxyEvent) => void) {
    const ch = new Channel<ProxyEvent>();
    ch.onmessage = onEvent;
    await invoke('ai_fetch', { provider, request, onEvent: ch });
  },
  cancel: (requestId: string) => commands.aiCancel(requestId),
};

export const tauriCoverage: CoverageService = {
  coverageFor: (url, title, excerpt) => commands.coverageFor(url, title, excerpt),
  async search(query) {
    const cards = (await commands.eventsSearch(query)).slice(0, 3);
    const details = await Promise.all(cards.map((c) => commands.eventDetail(c.eventId)));
    return details.flatMap((d) => d?.articles ?? []);
  },
};

export const tauriLexicon: LexiconService = { score: (text, locale) => commands.lexiconScore(text, locale) };

export const tauriSources: SourceFetcher = { fetch: (url, allowExtra) => commands.sourceFetch(url, allowExtra) };

export const tauriCache: CacheStore = {
  get: async (url, hash, stage) => (await commands.analysisCacheGet(url, hash, stage))?.json ?? null,
  put: (url, hash, stage, json, model, costUsd) => commands.analysisCachePut(url, hash, stage, json, model, costUsd),
};

export const tauriUsage: UsageSink = {
  record: (provider, model, usage, costUsd) => commands.usageRecord(provider, model, usage.inputTokens, usage.outputTokens, costUsd),
};

export const extract = (html: string, url: string) => extractFromHtml(html, url);
