import { delimit, UNTRUSTED_NOTE } from '../llm/delimit';
import { generateStructured, StageError } from '../llm/structured';
import type { ArticleInput } from '../schemas/article';
import { LlmClaimsOutputSchema, type ClaimsOutput } from '../schemas/claims';
import { capCoverage, countWords, dropOverlaps, locate, onWordBoundaries, type Span } from '../text/anchor';
import type { StageCtx, StageResult } from './ctx';

/**
 * Recoloca cada cita en el texto buscándola (exacta, normalizada, con puntos suspensivos o, solo si es casi idéntica,
 * la frase parecida). Los desplazamientos del modelo no se usan salvo para desempatar repeticiones; lo que no se
 * puede situar con seguridad se descarta.
 */
export function repairSpans<T extends { quote: string; span?: Span }>(text: string, items: T[], opts: { sentenceFallback?: boolean } = {}): (T & { span: Span })[] {
  const out: (T & { span: Span })[] = [];
  for (const it of items) {
    const hit = locate(text, it.quote, it.span, { fuzzy: opts.sentenceFallback !== false });
    if (!hit) continue;
    out.push({ ...it, quote: text.slice(hit.span[0], hit.span[1]), span: hit.span });
  }
  return out;
}

/** Límites de una marca útil. Una afirmación es una frase (no un párrafo ni dos frases); una expresión cargada, unas palabras. */
export const LIMITS = { claim: { min: 12, max: 240, words: 50 }, loaded: { min: 6, max: 70, minWords: 2, maxWords: 8 }, maxClaims: 12, maxLoaded: 6, maxCoverage: 0.4 } as const;

const noBreak = (text: string, [a, b]: Span) => !/\n/.test(text.slice(a, b));
const endsSentence = (s: string) => /[.!?…]["”»')\]]*$/.test(s.trim());
const sentenceMarks = (s: string) => (s.trim().replace(/[.!?…]+["”»')\]]*$/, '').match(/[.!?…]\s+\p{Lu}/gu) ?? []).length;

/** Descarta lo que no es una cita útil: demasiado corta o larga, varias frases, a mitad de palabra o a caballo entre párrafos. */
function sane<T extends { span: Span }>(text: string, items: T[], kind: 'claim' | 'loaded'): T[] {
  return items.filter((c) => {
    const [a, b] = c.span;
    const q = text.slice(a, b);
    if (!noBreak(text, c.span) || !onWordBoundaries(text, c.span)) return false;
    if (kind === 'claim') return q.length >= LIMITS.claim.min && q.length <= LIMITS.claim.max && countWords(q) <= LIMITS.claim.words && sentenceMarks(q) === 0;
    const w = countWords(q);
    // Ni una palabra suelta ni una frase completa: solo el tramo que carga el juicio.
    return q.length >= LIMITS.loaded.min && q.length <= LIMITS.loaded.max && w >= LIMITS.loaded.minWords && w <= LIMITS.loaded.maxWords && !(endsSentence(q) && w > 5) && sentenceMarks(q) === 0;
  });
}

const SYSTEM = (quick: boolean) => `You analyse news articles for a fact-checking tool.
${quick ? 'Return only loaded phrases: set "claims" to an empty array.' : `List the article's claims. kind: "hecho" (verifiable fact), "cifra" (number or statistic), "opinion" (value judgement or intention), "atribucion" (something attributed to a named source). checkable=true only if public evidence could confirm or refute it.`}
List loaded phrases: emotionally charged, hyperbolic or evaluative wording; give the reason in one short sentence.
Be selective and precise: a claim is ONE sentence (or a clause) that states something, at most about 40 words, never a whole paragraph and never two sentences; list at most ${LIMITS.maxClaims}, the most important and checkable first, skipping filler and the headline. A loaded phrase is ${LIMITS.loaded.minWords} to ${LIMITS.loaded.maxWords} consecutive words that carry the charged or evaluative wording itself (never a single common word, never a whole sentence); list at most ${LIMITS.maxLoaded}, only if clearly loaded.
Every "quote" must be copied verbatim from the article, character by character, in the article's own language: do not paraphrase, shorten with "...", translate, fix typos or add anything in brackets. Do not give character offsets.
The "reason" and every other explanation are written in the requested output language.`;

export async function detectClaims(ctx: StageCtx, article: ArticleInput, opts: { quick: boolean }): Promise<StageResult<ClaimsOutput>> {
  const r = await generateStructured({
    model: ctx.model,
    schema: LlmClaimsOutputSchema,
    system: `${SYSTEM(opts.quick)}\n${UNTRUSTED_NOTE}\n${ctx.locale === 'es' ? 'Write the reasons in Spanish.' : ctx.locale === 'de' ? 'Write the reasons in German.' : 'Write the reasons in English.'}`,
    prompt: `${opts.quick ? 'Only loaded phrases.' : 'Claims and loaded phrases.'}\n${delimit('ARTICLE', article.text)}`,
    stage: opts.quick ? 'quickScore' : 'claims',
    temperature: ctx.temperature,
    noTemperature: ctx.noTemperature,
    maxOutputTokens: ctx.maxOutputTokens,
    providerOptions: ctx.providerOptions,
    signal: ctx.signal,
  });
  const text = article.text;
  // Orden de prioridad = orden del modelo (lo más importante primero). Se sitúa, se filtra, se acota lo marcado y se quitan solapes.
  const located = sane(text, repairSpans(text, r.object.claims), 'claim');
  const claims = dropOverlaps(capCoverage(located.slice(0, LIMITS.maxClaims), text.length, LIMITS.maxCoverage - 0.1))
    .map((c, i) => ({ id: `c${i + 1}`, quote: c.quote, span: c.span, kind: c.kind, checkable: c.checkable }));
  const loadedLocated = sane(text, repairSpans(text, r.object.loadedPhrases.filter((l) => l.reason.trim()), { sentenceFallback: false }), 'loaded');
  const loadedPhrases = dropOverlaps(capCoverage(loadedLocated.slice(0, LIMITS.maxLoaded), text.length, 0.1))
    .map((l) => ({ quote: l.quote, span: l.span, reason: l.reason }));
  if (!opts.quick && r.object.claims.length > 0 && claims.length === 0) {
    throw new StageError('claims', 'invalid_output', 'none of the claims could be located in the article text');
  }
  return { value: { claims: opts.quick ? [] : claims, loadedPhrases }, usage: r.usage };
}
