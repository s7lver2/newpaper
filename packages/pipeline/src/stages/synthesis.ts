import { delimit, UNTRUSTED_NOTE } from '../llm/delimit';
import { languageInstruction } from '../llm/language';
import { generateStructured } from '../llm/structured';
import type { ArticleInput } from '../schemas/article';
import type { Claim } from '../schemas/claims';
import type { Coverage } from '../schemas/coverage';
import type { Score } from '../schemas/score';
import { SynthesisSchema, type Synthesis } from '../schemas/synthesis';
import type { Verdict } from '../schemas/verdicts';
import type { Visualization } from '../schemas/visualization';
import type { StageCtx, StageResult } from './ctx';
import type { RetrievedSource } from './verify';

export function validateVisualizations(vs: Visualization[], sourceIds: Set<string>, partyIds: Set<string>): Visualization[] {
  const out: Visualization[] = [];
  for (const v of vs) {
    const ids = v.sourceIds.filter((id) => sourceIds.has(id));
    if (!ids.length) continue; // §6.2: datos sin fuente → no se dibujan
    if (v.type === 'parliament') {
      const { total, majority, series } = v.data;
      if (majority !== Math.floor(total / 2) + 1) continue;
      if (series.some((s) => s.seats.reduce((n, x) => n + x.seats, 0) > total)) continue;
      if (series.some((s) => s.seats.some((x) => !partyIds.has(x.partyId)))) continue;
    }
    out.push({ ...v, sourceIds: ids } as Visualization);
  }
  return out;
}

const SYSTEM = `Write a neutral version of the news event, based only on the article, the verdicts and the retrieved sources.
- headline: neutral, factual. summary3: exactly three sentences.
- facts: each with kind hecho (established), atribuida (attributed to someone) or disputa (contested), and the ids (S1…) of the sources that support it.
- parties: what each side says, with the source id.
- disputes: contested questions with positions and how much evidence supports each (0–1).
- unknowns: what is not known yet.
- visualizations: only when data comes from the cited sources; types bar, line, range, stacked, matrix, table, parliament (seats per party id from the parliament list given), map. Never invent numbers.
- rewrites: for loaded or misleading wording, {from: exact fragment of the original article, to: neutral wording, reason}.`;

export async function synthesize(o: {
  ctx: StageCtx;
  article: ArticleInput;
  claims: Claim[];
  verdicts: Verdict[];
  sources: RetrievedSource[];
  coverages: Coverage[];
  score: Score | null;
  partyIds: Set<string>;
}): Promise<StageResult<Synthesis>> {
  const r = await generateStructured({
    model: o.ctx.model,
    schema: SynthesisSchema,
    system: `${SYSTEM}\nParliament party ids: ${[...o.partyIds].join(', ') || 'none'}.\n${UNTRUSTED_NOTE}\n${languageInstruction(o.ctx.locale)}`,
    prompt: [
      delimit('ARTICLE', o.article.text),
      `Claims and verdicts:\n${o.claims.map((c) => `${c.id}: ${c.quote} → ${o.verdicts.find((v) => v.claimId === c.id)?.status ?? 'sin verificar'}`).join('\n')}`,
      `Other coverage headlines: ${o.coverages.map((c) => c.title).join(' | ')}`,
      ...o.sources.map((s) => delimit(`SOURCE ${s.id}`, `${s.title}\n${s.text}`)),
    ].join('\n'),
    stage: 'synthesis',
    temperature: o.ctx.temperature,
    noTemperature: o.ctx.noTemperature,
    signal: o.ctx.signal,
  });
  const ids = new Set(o.sources.map((s) => s.id));
  const s = r.object;
  return {
    value: {
      ...s,
      facts: s.facts.map((f) => ({ ...f, sourceIds: f.sourceIds.filter((id) => ids.has(id)) })),
      parties: s.parties.filter((p) => ids.has(p.sourceId)),
      visualizations: validateVisualizations(s.visualizations, ids, o.partyIds),
      rewrites: s.rewrites.filter((w) => o.article.text.includes(w.from)),
    },
    usage: r.usage,
  };
}
