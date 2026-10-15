import { extractFromHtml, type Article } from '@newpaper/extract';
import type { AnalysisResult, StageEvent } from '@newpaper/pipeline';
import { useSyncExternalStore } from 'react';
import { getPipeline } from './ai/pipeline';
import { ipc } from './ipc';

export interface ReadingState {
  url: string | null;
  article: Article | null;
  quick: AnalysisResult | null;
  full: AnalysisResult | null;
  busy: 'loading' | 'quick' | 'full' | null;
  error: string | null;
  /** Estado de cada paso del análisis en curso (los eventos `onStage` del pipeline). */
  stages: Partial<Record<StageEvent['stage'], StageEvent['status']>>;
}

export const STAGE_ORDER: StageEvent['stage'][] = ['claims', 'quickScore', 'verify', 'score', 'judgeB', 'synthesis', 'aiDetect'];

let state: ReadingState = { url: null, article: null, quick: null, full: null, busy: null, error: null, stages: {} };
const listeners = new Set<() => void>();
const set = (p: Partial<ReadingState>) => {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
};
export const useReading = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state);
export const readingState = () => state;

const input = (a: Article) => ({ url: a.url, title: a.title, text: a.text, lang: a.lang, siteName: a.siteName, byline: a.byline, published: a.published });

/** Extrae el artículo del HTML (lo descarga Rust o llega del "Ver original") y arranca el análisis rápido si procede. */
export async function showHtml(url: string, html: string): Promise<void> {
  const article = extractFromHtml(html, url);
  if (!article) return set({ url, article: null, busy: null, error: 'not-article' });
  set({ url, article, quick: null, full: null, busy: null, error: null });
  void ipc.historyRecordVisit(url, article.title).catch(() => {});
  if ((await ipc.settingsGet<boolean>('ai.quickOnOpen')) ?? true) void analyze('quick');
}

export async function loadArticle(url: string): Promise<void> {
  if (state.url === url && state.article) return;
  set({ url, article: null, quick: null, full: null, busy: 'loading', error: null });
  try {
    await showHtml(url, await ipc.fetchPage(url));
  } catch (e) {
    set({ busy: null, error: String((e as { message?: string }).message ?? e) });
  }
}

export async function analyze(kind: 'quick' | 'full'): Promise<void> {
  const a = state.article;
  if (!a) return;
  set({ busy: kind, error: null, stages: {} });
  const onStage = (e: StageEvent) => set({ stages: { ...state.stages, [e.stage]: e.status } });
  try {
    const p = await getPipeline();
    const r = kind === 'quick' ? await p.runQuickAnalysis(input(a), { onStage }) : await p.runFullAnalysis(input(a), { onStage });
    if (state.url === a.url) set(kind === 'quick' ? { quick: r, busy: null } : { full: r, busy: null });
  } catch (e) {
    if (state.url === a.url) set({ busy: null, error: String((e as Error).message ?? e) });
  }
}
