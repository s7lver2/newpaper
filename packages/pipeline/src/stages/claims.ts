import { delimit, UNTRUSTED_NOTE } from '../llm/delimit';
import { languageInstruction } from '../llm/language';
import { generateStructured, StageError } from '../llm/structured';
import type { ArticleInput } from '../schemas/article';
import { ClaimsOutputSchema, type ClaimsOutput } from '../schemas/claims';
import type { StageCtx, StageResult } from './ctx';

const fold = (ch: string): string => {
  if (/\s/.test(ch)) return ' ';
  if (/[‘’‚‛′´`]/.test(ch)) return "'";
  if (/[“”„‟«»″]/.test(ch)) return '"';
  if (/[‐-―−]/.test(ch)) return '-';
  if (ch === '…') return '.';
  return ch.toLowerCase();
};

/** Texto normalizado (espacios, comillas, guiones, mayúsculas) con el índice original de cada carácter. */
function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  let prevSpace = false;
  for (let i = 0; i < text.length; i++) {
    const f = fold(text[i]!);
    if (f === ' ') {
      if (prevSpace || folded === '') continue;
      prevSpace = true;
    } else prevSpace = false;
    folded += f;
    map.push(i);
  }
  return { folded, map };
}

const words = (s: string): string[] =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);

/** Frase del texto que más se parece a la cita (los modelos a veces parafrasean o recortan). */
function closestSentence(text: string, quote: string): [number, number] | null {
  const qw = new Set(words(quote));
  if (qw.size < 3) return null;
  let best: [number, number] | null = null;
  let bestScore = 0;
  for (const m of text.matchAll(/[^.!?\n]+[.!?]?/g)) {
    const sw = new Set(words(m[0]));
    if (!sw.size) continue;
    let hit = 0;
    for (const w of qw) if (sw.has(w)) hit++;
    const score = hit / qw.size;
    if (score > bestScore) {
      bestScore = score;
      const lead = m[0].length - m[0].trimStart().length;
      best = [m.index! + lead, m.index! + m[0].trimEnd().length];
    }
  }
  return bestScore >= 0.6 ? best : null;
}

/** Recoloca cada cita en el texto: exacta, normalizada o, como último recurso, la frase más parecida. */
export function repairSpans<T extends { quote: string; span: [number, number] }>(text: string, items: T[]): T[] {
  const out: T[] = [];
  const { folded, map } = foldWithMap(text);
  for (const it of items) {
    if (text.slice(it.span[0], it.span[1]) === it.quote) {
      out.push(it);
      continue;
    }
    let best = -1;
    for (let i = text.indexOf(it.quote); i >= 0; i = text.indexOf(it.quote, i + 1)) {
      if (best < 0 || Math.abs(i - it.span[0]) < Math.abs(best - it.span[0])) best = i;
    }
    if (best >= 0) {
      out.push({ ...it, span: [best, best + it.quote.length] });
      continue;
    }
    const fq = foldWithMap(it.quote).folded.trim();
    const at = fq.length >= 8 ? folded.indexOf(fq) : -1;
    if (at >= 0) {
      const a = map[at]!;
      const b = map[at + fq.length - 1]! + 1;
      out.push({ ...it, quote: text.slice(a, b), span: [a, b] });
      continue;
    }
    const near = closestSentence(text, it.quote);
    if (near) out.push({ ...it, quote: text.slice(near[0], near[1]), span: near });
  }
  return out;
}

function dedupe<T extends { span: [number, number] }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((c) => {
    const k = c.span.join(':');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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
  const claims = dedupe(repairSpans(article.text, r.object.claims)).map((c, i) => ({ ...c, id: `c${i + 1}` }));
  const loadedPhrases = dedupe(repairSpans(article.text, r.object.loadedPhrases));
  if (!opts.quick && r.object.claims.length > 0 && claims.length === 0) {
    throw new StageError('claims', 'invalid_output', 'none of the claims could be located in the article text');
  }
  return { value: { claims: opts.quick ? [] : claims, loadedPhrases }, usage: r.usage };
}
