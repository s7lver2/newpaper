import { z } from 'zod';
import { delimit, UNTRUSTED_NOTE } from '../llm/delimit';
import { languageInstruction } from '../llm/language';
import { generateStructured } from '../llm/structured';
import type { CoverageResult, CoverageService, ExtractFn, SourceFetcher } from '../run/ports';
import type { ArticleInput } from '../schemas/article';
import type { Claim } from '../schemas/claims';
import type { Coverage } from '../schemas/coverage';
import { VerdictStatusSchema, type Source, type Verdict } from '../schemas/verdicts';
import { addUsage, ZERO_USAGE, type StageCtx, type StageResult } from './ctx';

export interface RetrievedSource extends Source { text: string; media: { kind: 'image' | 'video'; url: string }[] }

export function findCoverage(svc: CoverageService, article: ArticleInput): Promise<CoverageResult> {
  return svc.coverageFor(article.url, article.title, article.text.slice(0, 600));
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return '';
  }
};
const inDomains = (u: string, domains: string[]) => domains.some((d) => host(u) === d || host(u).endsWith(`.${d}`));

function mediaOf(html: string, base: string): RetrievedSource['media'] {
  // Sin DOM (entornos de prueba sin jsdom) no hay medios que extraer; en WebView2 DOMParser siempre existe.
  if (typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const abs = (u: string | null) => {
    try {
      return u ? new URL(u, base).href : null;
    } catch {
      return null;
    }
  };
  const out: RetrievedSource['media'] = [];
  const og = abs(doc.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? null);
  if (og) out.push({ kind: 'image', url: og });
  doc.querySelectorAll('img[src]').forEach((i) => {
    const u = abs(i.getAttribute('src'));
    if (u && /^https?:/.test(u)) out.push({ kind: 'image', url: u });
  });
  doc.querySelectorAll('video[src], video source[src]').forEach((v) => {
    const u = abs(v.getAttribute('src'));
    if (u) out.push({ kind: 'video', url: u });
  });
  return out.slice(0, 20);
}

export async function retrieveSources(o: {
  ctx: StageCtx;
  claims: Claim[];
  coverages: Coverage[];
  primaryDomains: string[];
  fetcher: SourceFetcher;
  extract: ExtractFn;
  maxPrimary?: number;
  maxCoverage?: number;
}): Promise<StageResult<RetrievedSource[]>> {
  const checkable = o.claims.filter((c) => c.checkable);
  let usage = ZERO_USAGE;
  let proposed: string[] = [];
  if (checkable.length) {
    const r = await generateStructured({
      model: o.ctx.model,
      schema: z.object({ urls: z.array(z.string()) }),
      system: `Propose up to ${o.maxPrimary ?? 6} specific URLs of primary sources that would confirm or refute these claims. Only use these domains: ${o.primaryDomains.join(', ')}.`,
      prompt: checkable.map((c) => `${c.id}: ${c.quote}`).join('\n'),
      stage: 'verify',
      temperature: 0,
      noTemperature: o.ctx.noTemperature,
      signal: o.ctx.signal,
    });
    usage = r.usage;
    proposed = r.object.urls.filter((u) => /^https?:\/\//.test(u) && inDomains(u, o.primaryDomains)).slice(0, o.maxPrimary ?? 6);
  }
  const targets: { url: string; kind: Source['kind']; extra: string[] }[] = [
    ...proposed.map((url) => ({ url, kind: 'primary' as const, extra: [] })),
    ...o.coverages.slice(0, o.maxCoverage ?? 6).map((c) => ({ url: c.url, kind: 'coverage' as const, extra: [c.url] })),
  ];
  // En paralelo (por Tor cada descarga es lenta); el orden de los ids se conserva.
  const fetched = await Promise.all(
    targets.map(async (t) => {
      try {
        const html = await o.fetcher.fetch(t.url, t.extra);
        const a = o.extract(html, t.url);
        return a ? { t, a, html } : null;
      } catch {
        return null; // fuente no disponible: se omite y no se puede citar
      }
    }),
  );
  const out: RetrievedSource[] = [];
  for (const f of fetched) {
    if (!f) continue;
    out.push({ id: `S${out.length + 1}`, url: f.t.url, title: f.a.title || f.t.url, kind: f.t.kind, text: f.a.text.slice(0, 6000), media: mediaOf(f.html, f.t.url) });
  }
  return { value: out, usage };
}

const VerifyOutSchema = z.object({
  verdicts: z.array(z.object({ claimId: z.string(), status: VerdictStatusSchema, explanation: z.string(), sourceIds: z.array(z.string()) })),
});

/** El modelo cita las fuentes por su id interno (S1, S2…): al usuario se le muestra el título de la fuente, no el id. */
export function humanizeSourceIds(text: string, byId: Map<string, { title: string }>): string {
  return text
    .replace(/\(?\[?\bS(\d+)\b\]?\)?/g, (_m, n: string) => {
      const s = byId.get(`S${n}`);
      return s ? `«${s.title.slice(0, 70)}»` : '';
    })
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

export async function verifyClaims(ctx: StageCtx, article: ArticleInput, claims: Claim[], sources: RetrievedSource[]): Promise<StageResult<{ verdicts: Verdict[]; dropped: string[] }>> {
  if (!claims.length) return { value: { verdicts: [], dropped: [] }, usage: ZERO_USAGE };
  const r = await generateStructured({
    model: ctx.model,
    schema: VerifyOutSchema,
    system: `You verify claims against the retrieved sources only. status: verificado, enganoso (misleading), falso, falta_contexto, opinion (not a factual claim), no_verificable (sources do not settle it). Cite sources by id (S1, S2…); never cite anything else.\n${UNTRUSTED_NOTE}\n${languageInstruction(ctx.locale)}`,
    prompt: [
      'Claims:',
      ...claims.map((c) => `${c.id} [${c.kind}]: ${c.quote}`),
      'Article context:',
      delimit('ARTICLE', article.text.slice(0, 8000)),
      'Retrieved sources:',
      ...sources.map((s) => delimit(`SOURCE ${s.id}`, `${s.title}\n${s.text}`)),
    ].join('\n'),
    stage: 'verify',
    temperature: ctx.temperature,
    noTemperature: ctx.noTemperature,
    signal: ctx.signal,
  });
  const byId = new Map(sources.map((s) => [s.id, s]));
  const known = new Set(claims.map((c) => c.id));
  const dropped: string[] = [];
  const verdicts: Verdict[] = [];
  for (const v of r.object.verdicts) {
    if (!known.has(v.claimId)) continue;
    const cited: Source[] = [];
    for (const id of v.sourceIds) {
      const s = byId.get(id);
      if (s) cited.push({ id: s.id, url: s.url, title: s.title, kind: s.kind });
      else dropped.push(`${v.claimId}:${id}`);
    }
    // Un veredicto factual sin ninguna fuente recuperada no se sostiene.
    const factual = v.status === 'verificado' || v.status === 'enganoso' || v.status === 'falso' || v.status === 'falta_contexto';
    verdicts.push({ claimId: v.claimId, status: factual && !cited.length ? 'no_verificable' : v.status, explanation: humanizeSourceIds(v.explanation, byId), sources: cited });
  }
  return { value: { verdicts, dropped }, usage: addUsage(ZERO_USAGE, r.usage) };
}
