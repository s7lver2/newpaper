// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { loadRegistry } from '../registry/registry';
import { DEFAULT_WEIGHTS } from '../stages/framing';
import { SMI_ARTICLE, SMI_COVERAGES } from '../test/fixtures';
import { textModel } from '../test/mock';
import type { CacheStore } from '../cache/key';
import type { PipelineDeps } from './ports';
import { createPipeline, type StageEvent } from './pipeline';

const registry = loadRegistry(JSON.parse(readFileSync(new URL('../../../../config/providers.json', import.meta.url), 'utf8')));

function memoryCache(): CacheStore & { rows: Map<string, string> } {
  const rows = new Map<string, string>();
  return {
    rows,
    get: async (url, hash, stage) => rows.get(`${url}|${hash}|${stage}`) ?? null,
    put: async (url, hash, stage, json) => void rows.set(`${url}|${hash}|${stage}`, json),
  };
}

function deps(cache = memoryCache()) {
  const models = {
    claims: textModel(JSON.stringify({ claims: [{ id: 'x', quote: 'ha crecido un 61 %', span: [0, 0], kind: 'cifra', checkable: true }], loadedPhrases: [{ quote: 'fiel a su costumbre', span: [0, 0], reason: 'Valorativo' }] })),
    verify: textModel(JSON.stringify({ urls: [] }), JSON.stringify({ verdicts: [{ claimId: 'c1', status: 'verificado', explanation: 'Coincide', sourceIds: ['S1'] }] })),
    score: textModel(JSON.stringify({ signals: [{ kind: 'adjetivacion', value: -0.6, evidence: ['fiel a su costumbre'] }, { kind: 'encuadre', value: -0.5, evidence: ['apocalipsis de empleo'] }], actors: [{ name: 'Sindicatos', quotes: 1, side: 'left' }], lastWordSide: 'left', omissions: [] })),
    synthesis: textModel('esto no es json'),
  };
  const usage = { record: vi.fn(async () => {}) };
  const d: PipelineDeps = {
    registry,
    models: { get: (ref) => ({ model: models[ref.model as keyof typeof models], noTemperature: false }) },
    assignments: async () => ({
      claims: { provider: 'ollama', model: 'claims' },
      verify: { provider: 'ollama', model: 'verify' },
      score: { provider: 'ollama', model: 'score' },
      synthesis: { provider: 'ollama', model: 'synthesis' },
    }),
    budget: async () => ({ spentUsd: 0, limitUsd: null }),
    usage,
    cache,
    coverage: { coverageFor: async () => ({ eventId: 1, coverages: SMI_COVERAGES, outletCount: 3, searched: false, searchSkipped: null, enough: true }), search: async () => [] },
    lexicon: { score: async () => ({ status: 'unavailable', value: null, confidence: 0, matches: [] }) },
    sources: { fetch: async (url) => `<html><body><article><p>${url} ${'texto '.repeat(50)}</p></article></body></html>` },
    extract: (html, url) => ({ url, title: `Cobertura ${url}`, byline: null, siteName: null, published: null, lang: 'es', html, text: 'texto de la cobertura '.repeat(20), excerpt: null, limited: false }),
    primaryDomains: async () => ['boe.es'],
    partyIds: async () => [],
    framingWeights: async () => DEFAULT_WEIGHTS,
    locale: () => 'es',
  };
  return { d, models, usage, cache };
}

describe('createPipeline', () => {
  it('runs the full analysis, isolates a failing stage and stores stage shapes for the index', async () => {
    const { d, usage, cache } = deps();
    const events: StageEvent[] = [];
    const r = await createPipeline(d).runFullAnalysis(SMI_ARTICLE, { onStage: (e) => events.push(e) });
    expect(r.claims!.claims[0]!.id).toBe('c1');
    expect(r.verdicts![0]!.sources[0]!.url).toBe(SMI_COVERAGES[0]!.url);
    expect(r.score).not.toBeNull();
    expect(r.aiAuthorship).not.toBeNull();
    expect(r.failed).toEqual(['synthesis']);
    expect(events).toContainEqual(expect.objectContaining({ stage: 'synthesis', status: 'failed' }));
    expect(usage.record).toHaveBeenCalled();
    const stored = [...cache.rows.entries()];
    expect(JSON.parse(stored.find(([k]) => k.endsWith('|verify'))![1])).toBeInstanceOf(Array);
    expect(JSON.parse(stored.find(([k]) => k.endsWith('|score'))![1])).toHaveProperty('framing');
  });

  it('serves repeated analyses from the cache without calling the models again', async () => {
    const cache = memoryCache();
    const first = deps(cache);
    await createPipeline(first.d).runFullAnalysis(SMI_ARTICLE);
    const second = deps(cache);
    const events: StageEvent[] = [];
    const r = await createPipeline(second.d).runFullAnalysis(SMI_ARTICLE, { onStage: (e) => events.push(e) });
    for (const s of ['claims', 'verify', 'score'] as const) {
      expect(events).toContainEqual({ stage: s, status: 'cached' });
      expect(second.models[s].doGenerateCalls).toHaveLength(0);
    }
    expect(r.score).toEqual((await createPipeline(first.d).runFullAnalysis(SMI_ARTICLE)).score);
  });
});
