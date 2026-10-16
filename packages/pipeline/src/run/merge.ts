import type { AnalysisResult } from './pipeline';

export type MergedResult = AnalysisResult & { scoreFromQuick?: boolean };

/**
 * Lo que se enseña: el análisis completo manda, pero no pierde lo que el rápido ya había calculado. Si el completo
 * no pudo puntuar (falló la etapa de puntuación), se mantiene la neutralidad del rápido, marcada como tal; las
 * expresiones cargadas del rápido se usan si el completo no devolvió ninguna.
 */
export function mergeResults(quick: AnalysisResult | null, full: AnalysisResult | null): MergedResult | null {
  if (!full) return quick;
  if (!quick) return full;
  const score = full.score ?? quick.score;
  const loaded = full.claims?.loadedPhrases.length ? full.claims.loadedPhrases : (quick.claims?.loadedPhrases ?? []);
  return {
    ...full,
    score,
    claims: full.claims ? { ...full.claims, loadedPhrases: loaded } : loaded.length ? { claims: [], loadedPhrases: loaded } : null,
    ...(!full.score && quick.score ? { scoreFromQuick: true } : {}),
  };
}
