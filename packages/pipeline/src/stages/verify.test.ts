// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { SMI_ARTICLE, SMI_COVERAGES } from '../test/fixtures';
import { textModel } from '../test/mock';
import type { Claim } from '../schemas/claims';
import { findCoverage, retrieveSources, verifyClaims } from './verify';

const claims: Claim[] = [
  { id: 'c1', quote: 'el nivel más alto de toda Europa', span: [0, 1], kind: 'cifra', checkable: true },
  { id: 'c2', quote: 'beneficiará a 2,5 millones de trabajadores', span: [0, 1], kind: 'cifra', checkable: true },
];
const ctx = (...out: string[]) => ({ model: textModel(...out), noTemperature: false, locale: 'es' as const });
const html = (t: string) => `<html><head><meta property="og:image" content="https://cdn.test/g.png"></head><body><article><h1>${t}</h1><p>${'Texto de la fuente. '.repeat(30)}</p><img src="https://cdn.test/chart.png"></article></body></html>`;

describe('findCoverage', () => {
  it('asks the coverage service with an excerpt', async () => {
    const svc = { coverageFor: vi.fn(async () => ({ eventId: 1, coverages: SMI_COVERAGES, outletCount: 3, searched: false, searchSkipped: null, enough: true })), search: vi.fn() };
    const r = await findCoverage(svc, SMI_ARTICLE);
    expect(r.outletCount).toBe(3);
    expect((svc.coverageFor.mock.calls[0] as unknown as string[])[2]!.length).toBeLessThanOrEqual(600);
  });
});

describe('retrieveSources', () => {
  it('fetches only whitelisted primary urls plus coverages and extracts their text and media', async () => {
    const fetcher = { fetch: vi.fn(async (url: string) => html(url)) };
    const extract = (h: string, url: string) => ({ url, title: `T ${url}`, byline: null, siteName: null, published: null, lang: 'es', html: h, text: 'Texto de la fuente. '.repeat(30), excerpt: null, limited: false });
    const proposals = JSON.stringify({ urls: ['https://ec.europa.eu/eurostat/x', 'https://blog.random/x', 'https://www.boe.es/y'] });
    const r = await retrieveSources({ ctx: ctx(proposals), claims, coverages: SMI_COVERAGES.slice(0, 1), primaryDomains: ['ec.europa.eu', 'boe.es'], fetcher, extract });
    const urls = r.value.map((s) => s.url);
    expect(urls).toEqual(['https://ec.europa.eu/eurostat/x', 'https://www.boe.es/y', 'https://agenciaiberica.example/smi']);
    expect(r.value.map((s) => s.id)).toEqual(['S1', 'S2', 'S3']);
    expect(r.value[0]!.kind).toBe('primary');
    expect(r.value[2]!.kind).toBe('coverage');
    expect(r.value[0]!.media.map((m) => m.url)).toContain('https://cdn.test/chart.png');
    expect(fetcher.fetch).toHaveBeenCalledWith('https://agenciaiberica.example/smi', ['https://agenciaiberica.example/smi']);
  });
});

describe('verifyClaims', () => {
  it('keeps only retrieved sources and logs dropped citations', async () => {
    const sources = [{ id: 'S1', url: 'https://ec.europa.eu/eurostat/x', title: 'Eurostat', kind: 'primary' as const, text: 'España es sexta en la UE.', media: [] }];
    const out = JSON.stringify({ verdicts: [
      { claimId: 'c1', status: 'enganoso', explanation: 'Sexto puesto, no primero.', sourceIds: ['S1', 'S9'] },
      { claimId: 'c2', status: 'verificado', explanation: 'Coincide.', sourceIds: ['S4'] },
      { claimId: 'c9', status: 'falso', explanation: 'x', sourceIds: [] },
    ] });
    const c = ctx(out);
    const r = await verifyClaims(c, SMI_ARTICLE, claims, sources);
    expect(r.value.verdicts).toHaveLength(2);
    expect(r.value.verdicts[0]!.sources.map((s) => s.url)).toEqual(['https://ec.europa.eu/eurostat/x']);
    expect(r.value.verdicts[1]!.sources).toEqual([]);
    expect(r.value.verdicts[1]!.status).toBe('no_verificable');
    expect(r.value.dropped).toEqual(['c1:S9', 'c2:S4']);
    expect(JSON.stringify(c.model.doGenerateCalls[0]!.prompt)).toContain('<<<DATA SOURCE S1');
  });
});

describe('humanizeSourceIds', () => {
  it('replaces internal source ids with the source title', async () => {
    const { humanizeSourceIds } = await import('./verify');
    const by = new Map([['S1', { title: 'INE' }], ['S2', { title: 'El País' }]]);
    expect(humanizeSourceIds('Según S1 y [S2], es cierto (S3).', by)).toBe('Según «INE» y «El País», es cierto.');
  });
});
