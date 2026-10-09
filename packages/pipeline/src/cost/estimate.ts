import type { Assignments } from '../assign/presets';
import type { StageId, Usage } from '../llm/structured';
import type { Registry } from '../registry/registry';
import type { ModelEntry } from '../registry/schema';

export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

/** Salida típica por etapa (tokens), para la estimación previa (§6.2 "Coste: estimado por etapa"). */
export const STAGE_OUTPUT_TOKENS: Record<StageId, number> = {
  claims: 1200, quickScore: 400, verify: 2500, score: 1500, judgeB: 1500, synthesis: 3000, aiDetect: 600, agent: 1200, investigate: 2000,
};
const PROMPT_OVERHEAD = 900;

export function stageInputTokens(stage: StageId, articleChars: number, coverageCount: number): number {
  const article = Math.ceil(articleChars / 4);
  switch (stage) {
    case 'verify': return PROMPT_OVERHEAD + article + coverageCount * 1500;
    case 'score':
    case 'judgeB': return PROMPT_OVERHEAD + article * (1 + Math.min(coverageCount, 5));
    case 'synthesis': return PROMPT_OVERHEAD + article + coverageCount * 800 + 2500;
    default: return PROMPT_OVERHEAD + article;
  }
}

export function costOf(model: ModelEntry | undefined, inputTokens: number, outputTokens: number): number | null {
  if (!model?.price) return null;
  return (inputTokens * model.price.input + outputTokens * model.price.output) / 1_000_000;
}

export function estimateAnalysis(reg: Registry, a: Assignments, articleText: string, coverageCount: number) {
  const perStage = (Object.entries(a) as [StageId, NonNullable<Assignments[StageId]>][]).map(([stage, x]) => ({
    stage,
    usd: costOf(reg.model(x.provider, x.model), stageInputTokens(stage, articleText.length, coverageCount), STAGE_OUTPUT_TOKENS[stage]),
  }));
  return { perStage, totalUsd: perStage.reduce((n, s) => n + (s.usd ?? 0), 0), unknown: perStage.some((s) => s.usd === null) };
}

export interface UsageSink {
  record(provider: string, model: string, usage: Usage, costUsd: number): Promise<void>;
}
