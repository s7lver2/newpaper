import { delimit, UNTRUSTED_NOTE } from '../llm/delimit';
import { languageInstruction } from '../llm/language';
import { generateStructured } from '../llm/structured';
import type { ArticleInput } from '../schemas/article';
import { ClaimsOutputSchema, type ClaimsOutput } from '../schemas/claims';
import type { StageCtx, StageResult } from './ctx';

export function repairSpans<T extends { quote: string; span: [number, number] }>(text: string, items: T[]): T[] {
  const out: T[] = [];
  for (const it of items) {
    if (text.slice(it.span[0], it.span[1]) === it.quote) {
      out.push(it);
      continue;
    }
    let best = -1;
    for (let i = text.indexOf(it.quote); i >= 0; i = text.indexOf(it.quote, i + 1)) {
      if (best < 0 || Math.abs(i - it.span[0]) < Math.abs(best - it.span[0])) best = i;
    }
    if (best >= 0) out.push({ ...it, span: [best, best + it.quote.length] });
  }
  return out;
}

const SYSTEM = (quick: boolean) => `You analyse news articles for a fact-checking tool.
${quick ? 'Return only loaded phrases: set "claims" to an empty array.' : `List the article's claims. kind: "hecho" (verifiable fact), "cifra" (number or statistic), "opinion" (value judgement or intention), "atribucion" (something attributed to a named source). checkable=true only if public evidence could confirm or refute it.`}
List loaded phrases: emotionally charged, hyperbolic or evaluative wording; give the reason in one short sentence.
Every "quote" must be copied verbatim from the article (exact characters) and "span" must be its [start, end) character offsets.`;

export async function detectClaims(ctx: StageCtx, article: ArticleInput, opts: { quick: boolean }): Promise<StageResult<ClaimsOutput>> {
  const r = await generateStructured({
    model: ctx.model,
    schema: ClaimsOutputSchema,
    system: `${SYSTEM(opts.quick)}\n${UNTRUSTED_NOTE}\n${languageInstruction(ctx.locale)}`,
    prompt: `${opts.quick ? 'Only loaded phrases.' : 'Claims and loaded phrases.'}\n${delimit('ARTICLE', article.text)}`,
    stage: opts.quick ? 'quickScore' : 'claims',
    temperature: ctx.temperature,
    noTemperature: ctx.noTemperature,
    signal: ctx.signal,
  });
  const claims = repairSpans(article.text, r.object.claims).map((c, i) => ({ ...c, id: `c${i + 1}` }));
  const loadedPhrases = repairSpans(article.text, r.object.loadedPhrases);
  return { value: { claims: opts.quick ? [] : claims, loadedPhrases }, usage: r.usage };
}
