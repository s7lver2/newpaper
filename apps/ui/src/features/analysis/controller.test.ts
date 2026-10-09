import type { AnalysisResult, Pipeline } from '@newpaper/pipeline';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PageArticle } from '../../ipc/types';
import { analysisStore, createAnalysisController } from './controller';

vi.mock('../ai/pipeline', () => ({ getPipeline: vi.fn() }));

const page = (url: string) =>
  ({ type: 'page', article: true, url, title: 'T', byline: null, siteName: 'Diario', published: null, lang: 'es', html: '<p>x</p>', text: `Texto ${url}`, excerpt: null, signals: { ogType: 'article', jsonLdTypes: [] } }) as unknown as PageArticle;
const result = (url: string, quick: boolean) =>
  ({ url, hash: 'h', quick, claims: null, coverage: null, verdicts: null, sources: [], score: null, synthesis: null, aiAuthorship: null, uncovered: false, failed: [], capped: false }) as AnalysisResult;

describe('analysis controller', () => {
  beforeEach(() => analysisStore.set({ byTab: {} }));

  it('drops the result of a page the tab has already left and aborts its run', async () => {
    let resolveA!: (r: AnalysisResult) => void;
    const signals: AbortSignal[] = [];
    const pipeline = {
      runQuickAnalysis: vi.fn(async (a: { url: string }, o: { signal: AbortSignal; onStage(e: unknown): void }) => {
        signals.push(o.signal);
        o.onStage({ stage: 'quickScore', status: 'running' });
        return a.url.endsWith('/a') ? new Promise<AnalysisResult>((r) => (resolveA = r)) : result(a.url, true);
      }),
    } as unknown as Pipeline;
    const c = createAnalysisController(async () => pipeline);
    const first = c.analyzeQuick(1, page('https://d.example/a#top'));
    await c.analyzeQuick(1, page('https://d.example/b'));
    resolveA(result('https://d.example/a', true));
    await first;
    const s = analysisStore.get().byTab[1]!;
    expect(s.url).toBe('https://d.example/b');
    expect(s.quick!.url).toBe('https://d.example/b');
    expect(s.phase).toBe('done');
    expect(signals[0]!.aborted).toBe(true);
    expect(s.stages.quickScore).toBe('running');
  });

  it('keeps the quick result when the full analysis fails', async () => {
    const pipeline = {
      runQuickAnalysis: vi.fn(async (a: { url: string }) => result(a.url, true)),
      runFullAnalysis: vi.fn(async (_a: unknown, o: { onStage(e: unknown): void }) => {
        o.onStage({ stage: 'claims', status: 'failed', error: 'x' });
        throw new Error('provider down');
      }),
    } as unknown as Pipeline;
    const c = createAnalysisController(async () => pipeline);
    await c.analyzeQuick(2, page('https://d.example/c'));
    await c.analyzeFull(2, page('https://d.example/c'));
    const s = analysisStore.get().byTab[2]!;
    expect(s.quick).not.toBeNull();
    expect(s.phase).toBe('error');
    expect(s.error).toBe('provider down');
    expect(s.stages.claims).toBe('failed');
  });
});
