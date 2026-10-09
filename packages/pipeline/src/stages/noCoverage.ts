import { delimit, UNTRUSTED_NOTE } from '../llm/delimit';
import { languageInstruction } from '../llm/language';
import { generateStructured } from '../llm/structured';
import type { CoverageResult } from '../run/ports';
import type { ArticleInput } from '../schemas/article';
import { UnverifiedReportSchema, type UnverifiedReport } from '../schemas/unverified';
import type { StageCtx, StageResult } from './ctx';
import type { RetrievedSource } from './verify';

/** §6.4: menos de 3 coberturas y ninguna fuente primaria. */
export const isUncovered = (c: CoverageResult, primarySourceCount: number) => c.outletCount < 3 && primarySourceCount === 0;

/** Investigación de un hecho sin cobertura: exige confirmación explícita en cada uso (`acknowledged: true`). */
export async function investigateUncovered(o: { ctx: StageCtx; article: ArticleInput; sources: RetrievedSource[]; acknowledged: true }): Promise<StageResult<UnverifiedReport>> {
  if (o.acknowledged !== true) throw new Error('investigation requires explicit acknowledgement on every use');
  const r = await generateStructured({
    model: o.ctx.model,
    schema: UnverifiedReportSchema,
    system: `Almost nobody has covered this event. Investigate carefully and say what can and cannot be known. Tag every claim: fuente_unica (single source), solo_redes (only social media), varias_no_oficiales (several unofficial sources), sin_fuente. Keep confidence at or below 0.35. Give concrete steps for the reader to check it themselves. Cite only the retrieved sources by id.\n${UNTRUSTED_NOTE}\n${languageInstruction(o.ctx.locale)}`,
    prompt: [delimit('ARTICLE', o.article.text), ...o.sources.map((s) => delimit(`SOURCE ${s.id}`, `${s.title}\n${s.text}`))].join('\n'),
    stage: 'investigate',
    temperature: o.ctx.temperature,
    noTemperature: o.ctx.noTemperature,
    signal: o.ctx.signal,
  });
  const ids = new Set(o.sources.map((s) => s.id));
  return {
    value: { ...r.object, unverified: true, confidence: Math.min(0.35, r.object.confidence), sources: r.object.sources.filter((s) => ids.has(s.id)) },
    usage: r.usage,
  };
}
