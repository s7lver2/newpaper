import type { LexiconService } from '../run/ports';
import type { ArticleInput } from '../schemas/article';
import type { Coverage } from '../schemas/coverage';
import type { Score } from '../schemas/score';
import { anonymize, docLabel } from './anonymize';
import { addUsage, ZERO_USAGE, type StageCtx, type StageResult } from './ctx';
import { combineFraming, validateEvidence, type FramingWeights, type JudgeOutput } from './framing';
import { judgeDocument } from './judge';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

async function lexiconRelative(lexicon: LexiconService, locale: StageCtx['locale'], text: string, others: string[]) {
  const a = await lexicon.score(text, locale);
  if (a.status !== 'ok' || a.value === null) return null;
  const group = (await Promise.all(others.map((t) => lexicon.score(t, locale)))).filter((s) => s.status === 'ok' && s.value !== null).map((s) => s.value!);
  const center = group.length ? mean(group) : 50;
  return { value: Math.max(-1, Math.min(1, (a.value - center) / 50)), confidence: a.confidence, evidence: a.matches.slice(0, 8).map((m) => text.slice(m.start, m.end)) };
}

export async function scoreArticle(o: {
  ctx: StageCtx;
  ctxB?: StageCtx & { label: string };
  article: ArticleInput;
  coverages: Coverage[];
  coverageTexts: Map<string, string>;
  outletNames: string[];
  domains: string[];
  lexicon: LexiconService;
  loadedPhrases: number;
  weights: FramingWeights;
}): Promise<StageResult<Score>> {
  const anon = (t: string) => anonymize(t, { outletNames: o.outletNames, domains: o.domains, bylines: [o.article.byline ?? ''].filter(Boolean), locale: o.ctx.locale });
  const docA = anon(o.article.text);
  const others = o.coverages
    .slice(0, 5)
    .map((c, i) => ({ label: docLabel(i + 1, o.ctx.locale), text: anon(o.coverageTexts.get(c.url) ?? c.title) }));
  const othersMap = new Map(others.map((d) => [d.label, d.text]));
  const known = o.coverages.map((c) => c.lean).filter((l): l is number => l !== null);
  const groupCenter = known.length ? mean(known) : 50;

  const lexiconRel = await lexiconRelative(o.lexicon, o.ctx.locale, o.article.text, o.coverages.map((c) => o.coverageTexts.get(c.url) ?? c.title));
  const runJudge = async (ctx: StageCtx) => {
    const r = await judgeDocument({ ctx, docA, others, mode: others.length ? 'relative' : 'absolute' });
    return { judge: validateEvidence(r.value, docA, othersMap), usage: r.usage };
  };
  const a = await runJudge(o.ctx);
  const score = combineFraming({ judge: a.judge, lexiconRel, groupCenter, loadedPhrases: o.loadedPhrases, weights: o.weights });
  let usage = addUsage(ZERO_USAGE, a.usage);
  if (o.ctxB) {
    const b = await runJudge(o.ctxB).catch(() => null);
    if (b) {
      usage = addUsage(usage, b.usage);
      const sb = combineFraming({ judge: b.judge, lexiconRel, groupCenter, loadedPhrases: o.loadedPhrases, weights: o.weights });
      score.judges = [{ model: 'A', framing: score.framing }, { model: o.ctxB.label, framing: sb.framing }];
      score.crossModelDisagreement = score.framing !== null && sb.framing !== null && Math.abs(score.framing - sb.framing) > 20;
    }
  }
  return { value: score, usage };
}

/** Análisis rápido (§6.2): etapa 5 parcial con un modelo local, sin coberturas. */
export async function quickScore(o: { ctx: StageCtx; article: ArticleInput; lexicon: LexiconService; loadedPhrases: number }): Promise<StageResult<Score>> {
  const docA = anonymize(o.article.text, { outletNames: [o.article.siteName ?? ''].filter(Boolean), domains: [], bylines: [o.article.byline ?? ''].filter(Boolean), locale: o.ctx.locale });
  const r = await judgeDocument({ ctx: o.ctx, docA, others: [], mode: 'absolute' });
  const lex = await o.lexicon.score(o.article.text, o.ctx.locale);
  const lexiconRel = lex.status === 'ok' && lex.value !== null ? { value: (lex.value - 50) / 50, confidence: lex.confidence, evidence: lex.matches.slice(0, 8).map((m) => o.article.text.slice(m.start, m.end)) } : null;
  const judge: JudgeOutput = validateEvidence(r.value, docA, new Map());
  const s = combineFraming({ judge, lexiconRel, groupCenter: 50, loadedPhrases: o.loadedPhrases, weights: { lexicon: 0.4, judge: 0.6, voices: 0.1, omissions: 0, minConfidence: 0.1, maxIntervalWidth: 100 } });
  return { value: { ...s, confidence: Math.min(0.4, s.confidence) }, usage: r.usage };
}
