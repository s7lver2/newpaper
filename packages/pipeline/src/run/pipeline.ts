import type { Assignment, Assignments } from '../assign/presets';
import { runWithFallback } from '../assign/fallback';
import { cachedStage, textHash } from '../cache/key';
import { applyBudget } from '../cost/budget';
import { costOf } from '../cost/estimate';
import type { StageId, Usage } from '../llm/structured';
import { testConnection } from '../registry/models';
import type { ArticleInput } from '../schemas/article';
import type { AiAuthorship } from '../schemas/authorship';
import type { AgentEvent, AgentMode } from '../schemas/agent';
import type { ClaimsOutput } from '../schemas/claims';
import type { Score } from '../schemas/score';
import type { Synthesis } from '../schemas/synthesis';
import type { UnverifiedReport } from '../schemas/unverified';
import type { Verdict } from '../schemas/verdicts';
import { runAgent } from '../stages/agent';
import { detectAiText } from '../stages/aiDetect';
import { detectClaims } from '../stages/claims';
import type { StageCtx, StageResult } from '../stages/ctx';
import { investigateUncovered as investigate, isUncovered } from '../stages/noCoverage';
import { quickScore, scoreArticle } from '../stages/score';
import { synthesize } from '../stages/synthesis';
import { findCoverage, retrieveSources, verifyClaims, type RetrievedSource } from '../stages/verify';
import type { CoverageResult, PipelineDeps } from './ports';

export interface StageEvent { stage: StageId; status: 'running' | 'done' | 'cached' | 'failed' | 'skipped'; error?: string; usedFallback?: boolean }
export interface RunOpts { signal?: AbortSignal; onStage?: (e: StageEvent) => void }
export interface AnalysisResult {
  url: string;
  hash: string;
  quick: boolean;
  claims: ClaimsOutput | null;
  coverage: CoverageResult | null;
  verdicts: Verdict[] | null;
  sources: RetrievedSource[];
  score: Score | null;
  synthesis: Synthesis | null;
  aiAuthorship: AiAuthorship | null;
  uncovered: boolean;
  failed: StageId[];
  capped: boolean;
}

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * Orquestador: cada etapa va aislada (un fallo se registra y no tumba el resto, §10),
 * con caché por hash(url + texto), presupuesto mensual y contabilidad de consumo.
 */
export function createPipeline(deps: PipelineDeps) {
  const ctxOf = (a: Assignment, signal?: AbortSignal): StageCtx => {
    const m = deps.models.get(a);
    return { model: m.model, noTemperature: m.noTemperature, temperature: a.temperature, locale: deps.locale(), signal };
  };

  /** Ejecuta una etapa LLM con fallback, contabiliza el consumo y devuelve el valor con el modelo usado. */
  async function runLlm<T>(a: Assignment, signal: AbortSignal | undefined, fn: (ctx: StageCtx) => Promise<StageResult<T>>) {
    const call = async (ref: { provider: string; model: string; temperature?: number }) => {
      const r = await fn(ctxOf(ref, signal));
      const cost = costOf(deps.registry.model(ref.provider, ref.model), r.usage.inputTokens, r.usage.outputTokens) ?? 0;
      await deps.usage.record(ref.provider, ref.model, r.usage as Usage, cost);
      return { value: r.value, model: `${ref.provider}/${ref.model}`, costUsd: cost };
    };
    const fb = a.fallback;
    const r = await runWithFallback(() => call(a), fb ? () => call(fb) : undefined);
    return { ...r.value, usedFallback: r.usedFallback };
  }

  async function prepare(article: ArticleInput) {
    const { spentUsd, limitUsd } = await deps.budget();
    const budget = applyBudget(await deps.assignments(), spentUsd, limitUsd, deps.registry);
    return { assignments: budget.assignments as Assignments, capped: budget.capped, hash: await textHash(article.url, article.text) };
  }

  function stageRunner(article: ArticleInput, hash: string, opts: RunOpts, failed: StageId[]) {
    const emit = (e: StageEvent) => opts.onStage?.(e);
    return async function stage<T>(id: StageId, a: Assignment | undefined, fn: (ctx: StageCtx) => Promise<StageResult<T>>, cacheIt = true): Promise<T | null> {
      if (!a) {
        emit({ stage: id, status: 'skipped' });
        return null;
      }
      emit({ stage: id, status: 'running' });
      try {
        let usedFallback = false;
        const compute = async () => {
          const r = await runLlm(a, opts.signal, fn);
          usedFallback = r.usedFallback;
          return r;
        };
        const r = cacheIt ? await cachedStage(deps.cache, article.url, hash, id, compute) : { value: (await compute()).value, fromCache: false };
        emit(r.fromCache ? { stage: id, status: 'cached' } : { stage: id, status: 'done', ...(usedFallback ? { usedFallback } : {}) });
        return r.value as T;
      } catch (e) {
        failed.push(id);
        emit({ stage: id, status: 'failed', error: e instanceof Error ? e.message : String(e) });
        return null;
      }
    };
  }

  async function runQuickAnalysis(article: ArticleInput, opts: RunOpts = {}): Promise<AnalysisResult> {
    const { assignments, capped, hash } = await prepare(article);
    const failed: StageId[] = [];
    const stage = stageRunner(article, hash, opts, failed);
    const a = assignments.quickScore ?? assignments.claims;
    const r = await stage('quickScore', a, async (ctx) => {
      const c = await detectClaims(ctx, article, { quick: true });
      const s = await quickScore({ ctx, article, lexicon: deps.lexicon, loadedPhrases: c.value.loadedPhrases.length });
      return { value: { loadedPhrases: c.value.loadedPhrases, score: s.value }, usage: { inputTokens: c.usage.inputTokens + s.usage.inputTokens, outputTokens: c.usage.outputTokens + s.usage.outputTokens } };
    });
    return {
      url: article.url, hash, quick: true,
      claims: r ? { claims: [], loadedPhrases: r.loadedPhrases } : null,
      coverage: null, verdicts: null, sources: [], score: r?.score ?? null, synthesis: null, aiAuthorship: null,
      uncovered: false, failed, capped,
    };
  }

  async function runFullAnalysis(article: ArticleInput, opts: RunOpts = {}): Promise<AnalysisResult> {
    const { assignments: as, capped, hash } = await prepare(article);
    const failed: StageId[] = [];
    const stage = stageRunner(article, hash, opts, failed);
    const locale = deps.locale();

    const claims = await stage('claims', as.claims, (ctx) => detectClaims(ctx, article, { quick: false }));
    const coverage = await findCoverage(deps.coverage, article).catch(() => null);
    const coverages = coverage?.coverages ?? [];
    let sources: RetrievedSource[] = [];

    const verdicts = await stage<Verdict[]>('verify', as.verify, async (ctx) => {
      const got = await retrieveSources({ ctx, claims: claims?.claims ?? [], coverages, primaryDomains: await deps.primaryDomains(), fetcher: deps.sources, extract: deps.extract });
      sources = got.value;
      const v = await verifyClaims(ctx, article, claims?.claims ?? [], sources);
      return { value: v.value.verdicts, usage: { inputTokens: got.usage.inputTokens + v.usage.inputTokens, outputTokens: got.usage.outputTokens + v.usage.outputTokens } };
    });
    if (!sources.length && verdicts) {
      // Resultado de la caché: se reconstruye la lista de fuentes citadas (sin texto).
      const seen = new Map<string, RetrievedSource>();
      for (const v of verdicts) for (const s of v.sources) seen.set(s.id, { ...s, text: '', media: [] });
      sources = [...seen.values()].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
    }

    const coverageTexts = new Map(sources.filter((s) => s.kind === 'coverage' && s.text).map((s) => [s.url, s.text]));
    const score = await stage('score', as.score, async (ctx) => {
      const b = as.judgeB;
      return scoreArticle({
        ctx,
        ctxB: b ? { ...ctxOf(b, opts.signal), label: `${b.provider}/${b.model}` } : undefined,
        article,
        coverages,
        coverageTexts,
        outletNames: [article.siteName ?? '', ...coverages.map((c) => c.outlet)].filter(Boolean),
        domains: [host(article.url), ...coverages.map((c) => host(c.url))].filter(Boolean),
        lexicon: deps.lexicon,
        loadedPhrases: claims?.loadedPhrases.length ?? 0,
        weights: await deps.framingWeights(),
      });
    });

    const partyIds = new Set(await deps.partyIds());
    const synthesis = await stage('synthesis', as.synthesis, (ctx) =>
      synthesize({ ctx, article, claims: claims?.claims ?? [], verdicts: verdicts ?? [], sources, coverages, score, partyIds }),
    );

    // El detector funciona sin modelo (señales heurísticas); el juicio LLM es opcional.
    let aiAuthorship: AiAuthorship | null = null;
    if (as.aiDetect) aiAuthorship = await stage('aiDetect', as.aiDetect, (ctx) => detectAiText({ text: article.text, locale, c2pa: null, ctx }));
    else aiAuthorship = (await detectAiText({ text: article.text, locale, c2pa: null })).value;

    const primaryCount = sources.filter((s) => s.kind === 'primary').length;
    const uncovered = coverage ? isUncovered(coverage, primaryCount) : false;
    await deps.onAnalyzed?.(article.url).catch(() => {});
    return { url: article.url, hash, quick: false, claims, coverage, verdicts, sources, score, synthesis, aiAuthorship, uncovered, failed, capped };
  }

  async function askAgent(o: {
    article: ArticleInput;
    previous: AnalysisResult | null;
    mode: AgentMode;
    question: string;
    fragment?: string;
    history?: { role: 'user' | 'assistant'; content: string }[];
    onEvent: (e: AgentEvent) => void;
    signal?: AbortSignal;
  }) {
    const a = (await deps.assignments()).agent;
    if (!a) throw new Error('no model assigned to the agent');
    const r = await runLlm(a, o.signal, async (ctx) => {
      const out = await runAgent({
        ctx,
        context: {
          article: o.article,
          coverages: [...(o.previous?.coverage?.coverages ?? [])],
          sources: [...(o.previous?.sources ?? [])],
          verdicts: o.previous?.verdicts ?? [],
          fragment: o.fragment,
          partyIds: new Set(await deps.partyIds()),
          primaryDomains: await deps.primaryDomains(),
        },
        mode: o.mode,
        question: o.question,
        history: o.history,
        coverage: deps.coverage,
        fetcher: deps.sources,
        extract: deps.extract,
        onEvent: o.onEvent,
      });
      return { value: { text: out.text, citations: out.citations }, usage: out.usage };
    });
    return r.value;
  }

  async function investigateUncovered(o: { article: ArticleInput; previous: AnalysisResult | null; acknowledged: true; signal?: AbortSignal }): Promise<UnverifiedReport> {
    const a = (await deps.assignments()).investigate;
    if (!a) throw new Error('no model assigned to the investigation');
    const r = await runLlm(a, o.signal, (ctx) => investigate({ ctx, article: o.article, sources: o.previous?.sources ?? [], acknowledged: o.acknowledged }));
    return r.value;
  }

  return {
    runQuickAnalysis,
    runFullAnalysis,
    askAgent,
    investigateUncovered,
    testConnection: (ref: { provider: string; model: string }, timeoutMs?: number) => testConnection(deps.models.get(ref).model, timeoutMs),
  };
}

export type Pipeline = ReturnType<typeof createPipeline>;
