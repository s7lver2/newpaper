import type { Assignment, Assignments } from '../assign/presets';
import type { StageId } from '../llm/structured';
import type { Registry } from '../registry/registry';

/** §6.2: "límite mensual: al alcanzarlo, el análisis completo pasa a modelos locales". */
export function applyBudget(a: Assignments, spentUsd: number, limitUsd: number | null, reg: Registry): { assignments: Assignments; capped: boolean } {
  if (limitUsd === null || spentUsd < limitUsd) return { assignments: a, capped: false };
  const out: Assignments = {};
  for (const [stage, x] of Object.entries(a) as [StageId, Assignment][]) {
    if (reg.get(x.provider)?.type === 'local') out[stage] = x;
    else if (x.fallback) out[stage] = { provider: x.fallback.provider, model: x.fallback.model };
  }
  return { assignments: out, capped: true };
}
