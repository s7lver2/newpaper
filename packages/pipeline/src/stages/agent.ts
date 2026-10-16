import { generateText, stepCountIs, streamText, tool } from 'ai';
import { describeError } from '../registry/models';
import { z } from 'zod';
import { delimit, UNTRUSTED_NOTE } from '../llm/delimit';
import { languageInstruction } from '../llm/language';
import type { Usage } from '../llm/structured';
import type { CoverageService, ExtractFn, SourceFetcher } from '../run/ports';
import type { AgentCitation, AgentEvent, AgentMode, MediaItem } from '../schemas/agent';
import type { ArticleInput } from '../schemas/article';
import type { Coverage } from '../schemas/coverage';
import type { Verdict } from '../schemas/verdicts';
import { VisualizationSchema } from '../schemas/visualization';
import type { StageCtx } from './ctx';
import { validateVisualizations } from './synthesis';
import type { RetrievedSource } from './verify';

export interface AgentContext {
  article: ArticleInput;
  coverages: Coverage[];
  sources: RetrievedSource[];
  verdicts: Verdict[];
  fragment?: string;
  partyIds: Set<string>;
  primaryDomains: string[];
}

const MODE: Record<AgentMode, string> = {
  ask: 'Answer the question about the article.',
  verify: 'Check whether the selected fragment or claim is accurate, using the retrieved sources.',
  explain: 'Explain the context and background needed to understand the fragment.',
};

/** Solo quedan las citas [n] que apuntan a una fuente recuperada; el resto se elimina (§6.5). */
export function cleanCitations(text: string, sources: RetrievedSource[]): { text: string; citations: AgentCitation[] } {
  const citations = new Map<number, AgentCitation>();
  const cleaned = text
    .replace(/\s*\[(\d+)\]/g, (m, d: string) => {
      const n = Number(d);
      const s = sources[n - 1];
      if (!s) return '';
      citations.set(n, { n, sourceId: s.id, title: s.title, url: s.url });
      return m;
    })
    .replace(/\s+([,.;])/g, '$1');
  return { text: cleaned, citations: [...citations.values()].sort((a, b) => a.n - b.n) };
}

const inDomains = (u: string, ds: string[]) => {
  try {
    const h = new URL(u).hostname;
    return ds.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
};

export async function runAgent(o: {
  ctx: StageCtx;
  context: AgentContext;
  mode: AgentMode;
  question: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  coverage: CoverageService;
  fetcher: SourceFetcher;
  extract: ExtractFn;
  onEvent: (e: AgentEvent) => void;
  /** Milisegundos sin ninguna señal del modelo tras los que se abandona el intento (por defecto 60 s). */
  idleMs?: number;
}): Promise<{ text: string; citations: AgentCitation[]; usage: Usage }> {
  const c = o.context;
  const sources = c.sources;
  // Los títulos vienen de páginas ajenas y esta lista va en el prompt de sistema: una línea, acotada, sin marcadores.
  const safeTitle = (t: string) => t.replace(/<<<[^>]*>>>/g, '').replace(/\s+/g, ' ').trim().slice(0, 140);
  const sourceList = () => sources.map((s, i) => `[${i + 1}] ${safeTitle(s.title)} — ${s.url}`).join('\n');
  const coverageUrls = () => new Set(c.coverages.map((x) => x.url));

  const tools = {
    searchCoverage: tool({
      description: 'Search other outlets covering a topic in the local news index.',
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        o.onEvent({ type: 'step', tool: 'searchCoverage' });
        const found = await o.coverage.search(query);
        c.coverages.push(...found.filter((f) => !coverageUrls().has(f.url)));
        return found.slice(0, 8).map((f) => ({ outlet: f.outlet, title: f.title, url: f.url, bucket: f.bucket }));
      },
    }),
    fetchSource: tool({
      description: 'Fetch a primary source (whitelisted domains) or a coverage article to read it. Returns its citation number.',
      inputSchema: z.object({ url: z.string() }),
      execute: async ({ url }) => {
        o.onEvent({ type: 'step', tool: 'fetchSource' });
        const isCoverage = coverageUrls().has(url);
        if (!isCoverage && !inDomains(url, c.primaryDomains)) return { error: 'not allowed: only primary-source domains or coverage articles' };
        const existing = sources.findIndex((s) => s.url === url);
        if (existing >= 0) return { n: existing + 1, text: delimit(`SOURCE ${existing + 1}`, sources[existing]!.text.slice(0, 4000)) };
        const a = o.extract(await o.fetcher.fetch(url, isCoverage ? [url] : []), url);
        if (!a) return { error: 'could not extract text' };
        sources.push({ id: `S${sources.length + 1}`, url, title: a.title || url, kind: isCoverage ? 'coverage' : 'primary', text: a.text.slice(0, 6000), media: [] });
        return { n: sources.length, title: safeTitle(a.title), text: delimit(`SOURCE ${sources.length}`, a.text.slice(0, 4000)) };
      },
    }),
    getVerdicts: tool({
      description: 'Get the verdicts already computed for the article claims.',
      inputSchema: z.object({}),
      execute: async () => {
        o.onEvent({ type: 'step', tool: 'getVerdicts' });
        return c.verdicts.map((v) => ({ claimId: v.claimId, status: v.status, explanation: v.explanation }));
      },
    }),
    renderVisualization: tool({
      description: 'Draw a chart inline (bar, line, range, stacked, matrix, table, parliament, map). Data must come from cited sources (sourceIds S1…).',
      inputSchema: z.object({ viz: VisualizationSchema }),
      execute: async ({ viz }) => {
        o.onEvent({ type: 'step', tool: 'renderVisualization' });
        const [ok] = validateVisualizations([viz], new Set(sources.map((s) => s.id)), c.partyIds);
        if (!ok) return { error: 'rejected: every chart needs data from a retrieved source and valid parties/majority' };
        o.onEvent({ type: 'visualization', viz: ok });
        return { ok: true };
      },
    }),
    showMedia: tool({
      description: 'Show an image or video that appears in a retrieved source. Never generated media.',
      inputSchema: z.object({ sourceId: z.string(), url: z.string(), kind: z.enum(['image', 'video']), caption: z.string() }),
      execute: async (m) => {
        o.onEvent({ type: 'step', tool: 'showMedia' });
        const src = sources.find((s) => s.id === m.sourceId);
        if (!src || !src.media.some((x) => x.url === m.url && x.kind === m.kind)) return { error: 'rejected: media must belong to the cited source' };
        const item: MediaItem = { kind: m.kind, url: m.url, sourceId: m.sourceId, caption: m.caption };
        o.onEvent({ type: 'media', media: item });
        return { ok: true };
      },
    }),
  };

  const system = [
    'You are the newpaper agent. Ground every factual statement in the numbered sources and cite them as [n]. If the sources do not settle something, say so.',
    MODE[o.mode],
    `Sources:\n${sourceList()}`,
    UNTRUSTED_NOTE,
    languageInstruction(o.ctx.locale),
  ].join('\n');
  const prompt = [
    delimit('ARTICLE', c.article.text.slice(0, 12000)),
    c.fragment ? delimit('FRAGMENT', c.fragment) : '',
    `Question: ${o.question}`,
  ].filter(Boolean).join('\n');

  // Cadena de intentos: con herramientas y en streaming; sin herramientas (algunos endpoints, como los gratuitos de NVIDIA NIM o
  // el esquema de las herramientas en Gemini, las rechazan); y sin streaming (si el transporte no entrega el SSE a medida
  // que llega, el flujo parece colgado). Cada intento tiene su propio plazo de inactividad: si el modelo no da señales
  // (texto, razonamiento o pasos de herramientas) en ese tiempo, se corta y se pasa al siguiente en vez de esperar sin fin.
  type Kind = 'stream-tools' | 'stream' | 'generate';
  const idleMs = o.idleMs ?? 60_000;
  const outputTokens = Math.max(o.ctx.maxOutputTokens ?? 0, 2048);
  const attempt = async (kind: Kind) => {
    const ac = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const touch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        ac.abort();
      }, idleMs);
    };
    const link = () => ac.abort();
    o.ctx.signal?.addEventListener('abort', link, { once: true });
    if (o.ctx.signal?.aborted) ac.abort();
    const base = {
      model: o.ctx.model,
      system,
      messages: [...(o.history ?? []), { role: 'user' as const, content: prompt }],
      temperature: o.ctx.noTemperature ? undefined : o.ctx.temperature,
      abortSignal: ac.signal,
      maxOutputTokens: outputTokens,
      ...(o.ctx.providerOptions ? { providerOptions: o.ctx.providerOptions } : {}),
    };
    let raw = '';
    let error: unknown;
    let usage: { inputTokens?: number; outputTokens?: number } | null = null;
    touch();
    try {
      if (kind === 'generate') {
        const r = await generateText(base);
        raw = r.text;
        usage = r.usage;
        if (raw) o.onEvent({ type: 'text', delta: raw });
      } else {
        const result = streamText({
          ...base,
          ...(kind === 'stream-tools' ? { tools, stopWhen: stepCountIs(6) } : {}),
          onChunk: touch,
          onStepFinish: touch,
          // streamText no lanza los errores del proveedor: sin esto la respuesta quedaba vacía en silencio.
          onError: ({ error: e }) => {
            error ??= e;
          },
        });
        for await (const delta of result.textStream) {
          touch();
          raw += delta;
          o.onEvent({ type: 'text', delta });
        }
        if (!error) usage = await result.totalUsage;
      }
    } catch (e) {
      error ??= e;
    } finally {
      clearTimeout(timer);
      o.ctx.signal?.removeEventListener('abort', link);
    }
    if (timedOut && !o.ctx.signal?.aborted) error = new Error(`sin respuesta del modelo en ${Math.round(idleMs / 1000)} s`);
    return { raw, error, usage };
  };

  const order: Kind[] = ['stream-tools', 'stream', 'generate'];
  let run = await attempt(order[0]!);
  for (let i = 1; i < order.length && (run.error || !run.raw.trim()) && !o.ctx.signal?.aborted; i++) {
    // El texto parcial del intento fallido se retira antes de reintentar (si no, la respuesta saldría duplicada).
    o.onEvent({ type: 'retry', reason: order[i] === 'generate' ? 'stream' : 'tools' });
    run = await attempt(order[i]!);
  }
  if (o.ctx.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
  if (run.error || !run.raw.trim() || !run.usage) {
    const message = run.error ? describeError(run.error) : 'el modelo no devolvió ninguna respuesta (puede haber agotado los tokens razonando)';
    o.onEvent({ type: 'error', message });
    throw new Error(message);
  }
  const usage = run.usage;
  const final = cleanCitations(run.raw, sources);
  o.onEvent({ type: 'done', text: final.text, citations: final.citations });
  return { ...final, usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 } };
}
