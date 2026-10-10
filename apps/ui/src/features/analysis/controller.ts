import type { AnalysisResult, ArticleInput, Pipeline, StageEvent, StageId } from '@newpaper/pipeline';
import { commands } from '../../ipc/commands';
import { onTabPage } from '../../ipc/events';
import type { PageArticle, TabId } from '../../ipc/types';
import { createStore } from '../../state/store';
import { getPipeline } from '../ai/pipeline';

export type Phase = 'idle' | 'quick' | 'full' | 'done' | 'error';
export interface TabAnalysis {
  url: string;
  article: ArticleInput;
  phase: Phase;
  quick: AnalysisResult | null;
  full: AnalysisResult | null;
  stages: Partial<Record<StageId, StageEvent['status']>>;
  /** Motivo de cada etapa fallida (mensaje del proveedor o de la validación). */
  stageErrors?: Partial<Record<StageId, string>>;
  error: string | null;
}

export const analysisStore = createStore<{ byTab: Record<number, TabAnalysis> }>({ byTab: {} });
export const useTabAnalysis = (tabId: TabId | null) => analysisStore.use((s) => (tabId === null ? undefined : s.byTab[tabId]));
export const latestResult = (a: TabAnalysis | undefined): AnalysisResult | null => (a ? (a.full ?? a.quick) : null);

const noHash = (u: string) => u.split('#')[0]!;
export function toArticleInput(p: PageArticle): ArticleInput {
  return { url: noHash(p.url), title: p.title, text: p.text, lang: p.lang, siteName: p.siteName, byline: p.byline, published: p.published };
}

export function createAnalysisController(pipeline: () => Promise<Pipeline>) {
  const runs = new Map<TabId, AbortController>();

  const patch = (tabId: TabId, url: string, f: (a: TabAnalysis) => TabAnalysis) =>
    analysisStore.set((s) => {
      const cur = s.byTab[tabId];
      if (!cur || cur.url !== url) return s;
      return { byTab: { ...s.byTab, [tabId]: f(cur) } };
    });

  async function run(tabId: TabId, page: PageArticle, kind: 'quick' | 'full'): Promise<void> {
    const article = toArticleInput(page);
    runs.get(tabId)?.abort();
    const ac = new AbortController();
    runs.set(tabId, ac);
    analysisStore.set((s) => {
      const cur = s.byTab[tabId];
      const base: TabAnalysis = cur && cur.url === article.url ? cur : { url: article.url, article, phase: 'idle', quick: null, full: null, stages: {}, error: null };
      return { byTab: { ...s.byTab, [tabId]: { ...base, phase: kind, error: null, stages: kind === 'full' ? {} : base.stages, ...(kind === 'full' ? { stageErrors: {} } : {}) } } };
    });
    const live = () => !ac.signal.aborted && runs.get(tabId) === ac;
    try {
      const p = await pipeline();
      const onStage = (e: StageEvent) => {
        if (live()) patch(tabId, article.url, (a) => ({ ...a, stages: { ...a.stages, [e.stage]: e.status }, ...(e.status === 'failed' && 'error' in e ? { stageErrors: { ...a.stageErrors, [e.stage]: String((e as { error?: unknown }).error ?? '') } } : {}) }));
      };
      const opts = { signal: ac.signal, onStage };
      const r = kind === 'quick' ? await p.runQuickAnalysis(article, opts) : await p.runFullAnalysis(article, opts);
      if (!live()) return;
      patch(tabId, article.url, (a) => (kind === 'quick' ? { ...a, phase: 'done', quick: r } : { ...a, phase: 'done', full: r }));
    } catch (e) {
      if (!live()) return;
      patch(tabId, article.url, (a) => ({ ...a, phase: 'error', error: e instanceof Error ? e.message : String(e) }));
    } finally {
      if (runs.get(tabId) === ac) runs.delete(tabId);
    }
  }

  return {
    analyzeQuick: (tabId: TabId, page: PageArticle) => run(tabId, page, 'quick'),
    analyzeFull: (tabId: TabId, page: PageArticle) => run(tabId, page, 'full'),
    cancel(tabId: TabId) {
      runs.get(tabId)?.abort();
      runs.delete(tabId);
    },
    /** Olvida las pestañas cerradas. */
    prune(openTabIds: TabId[]) {
      const open = new Set(openTabIds);
      for (const id of [...runs.keys()]) if (!open.has(id)) this.cancel(id);
      analysisStore.set((s) => {
        const byTab = Object.fromEntries(Object.entries(s.byTab).filter(([id]) => open.has(Number(id))));
        return Object.keys(byTab).length === Object.keys(s.byTab).length ? s : { byTab };
      });
    },
  };
}

export const controller = createAnalysisController(getPipeline);

export function startAutoAnalysis(): Promise<() => void> {
  return onTabPage(async (e) => {
    if (!e.isNews || !e.article.article) return;
    const autoFull = (await commands.settingsGet<boolean>('ai.autoFull')) ?? false;
    const quick = (await commands.settingsGet<boolean>('ai.quickOnOpen')) ?? true;
    if (autoFull) void controller.analyzeFull(e.tabId, e.article);
    else if (quick) void controller.analyzeQuick(e.tabId, e.article);
  });
}
