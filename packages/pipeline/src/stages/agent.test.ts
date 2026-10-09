import { describe, expect, it, vi } from 'vitest';
import { SMI_ARTICLE, SMI_COVERAGES } from '../test/fixtures';
import { streamModel } from '../test/mock';
import type { AgentEvent } from '../schemas/agent';
import { cleanCitations, runAgent, type AgentContext } from './agent';

const sources = [{ id: 'S1', url: 'https://ec.europa.eu/eurostat/x', title: 'Eurostat', kind: 'primary' as const, text: 'España, sexta.', media: [{ kind: 'image' as const, url: 'https://ec.europa.eu/chart.png' }] }];
const context: AgentContext = { article: SMI_ARTICLE, coverages: SMI_COVERAGES, sources, verdicts: [], fragment: 'el nivel más alto de toda Europa', partyIds: new Set(['GP', 'GS']), primaryDomains: ['ec.europa.eu'] };

describe('cleanCitations', () => {
  it('keeps citations that map to retrieved sources and removes the rest', () => {
    const r = cleanCitations('España es sexta [1]. Otro dato [7].', sources);
    expect(r.text).toBe('España es sexta [1]. Otro dato.');
    expect(r.citations).toEqual([{ n: 1, sourceId: 'S1', title: 'Eurostat', url: 'https://ec.europa.eu/eurostat/x' }]);
  });
});

describe('runAgent', () => {
  it('runs tools, emits validated visuals and media, and ends with mapped citations', async () => {
    const model = streamModel([
      {
        toolCalls: [
          { name: 'renderVisualization', input: { viz: { type: 'bar', title: 'SMI UE', sourceIds: ['S1'], data: { points: [{ x: 'ES', y: 1184 }] } } } },
          { name: 'renderVisualization', input: { viz: { type: 'bar', title: 'Inventado', sourceIds: ['S9'], data: { points: [{ x: 'X', y: 1 }] } } } },
          { name: 'showMedia', input: { sourceId: 'S1', url: 'https://ec.europa.eu/chart.png', kind: 'image', caption: 'Gráfico' } },
          { name: 'showMedia', input: { sourceId: 'S1', url: 'https://ai.example/generated.png', kind: 'image', caption: 'x' } },
        ],
      },
      { text: 'España ocupa el sexto puesto [1], no el primero [3].' },
    ]);
    const events: AgentEvent[] = [];
    const r = await runAgent({
      ctx: { model, noTemperature: false, locale: 'es' }, context, mode: 'verify', question: '¿Es el más alto de Europa?',
      coverage: { coverageFor: vi.fn(), search: vi.fn(async () => []) }, fetcher: { fetch: vi.fn() }, extract: vi.fn(),
      onEvent: (e) => events.push(e),
    });
    expect(events.filter((e) => e.type === 'visualization')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'media')).toHaveLength(1);
    expect(r.text).toBe('España ocupa el sexto puesto [1], no el primero.');
    expect(r.citations).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: 'done' });
    const prompt = JSON.stringify(model.doStreamCalls[0]!.prompt);
    expect(prompt).toContain('[1] Eurostat');
    expect(prompt).toContain('<<<DATA FRAGMENT');
  });

  it('fetchSource only accepts whitelisted or coverage urls and registers new sources', async () => {
    const model = streamModel([{ toolCalls: [{ name: 'fetchSource', input: { url: 'https://blog.random/x' } }, { name: 'fetchSource', input: { url: 'https://ec.europa.eu/other' } }] }, { text: 'Hecho [2].' }]);
    const fetcher = { fetch: vi.fn(async () => '<html><body><p>texto</p></body></html>') };
    const extract = vi.fn((h: string, url: string) => ({ url, title: 'Otra fuente', byline: null, siteName: null, published: null, lang: 'es', html: h, text: 'texto largo', excerpt: null, limited: false }));
    const r = await runAgent({
      ctx: { model, noTemperature: false, locale: 'es' }, context: { ...context, sources: [...sources] }, mode: 'ask', question: 'q',
      coverage: { coverageFor: vi.fn(), search: vi.fn(async () => []) }, fetcher, extract, onEvent: () => {},
    });
    expect(fetcher.fetch).toHaveBeenCalledTimes(1);
    expect(r.citations[0]).toMatchObject({ n: 2, url: 'https://ec.europa.eu/other' });
  });
});
