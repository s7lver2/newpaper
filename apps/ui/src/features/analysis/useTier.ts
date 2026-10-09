import { useI18n } from '@newpaper/i18n/react';
import type { AnalysisResult, Assignments, Registry } from '@newpaper/pipeline';
import { useEffect, useState } from 'react';
import { useSetting } from '../../state/settings';
import { getRegistry } from '../ai/pipeline';

/** Modelo asignado a una etapa: nombre del proveedor, del modelo y si corre en el equipo. */
export function useAssigned(stage: keyof Assignments): { provider: string; model: string; local: boolean } | null {
  const [assignments] = useSetting<Assignments>('ai.assignments', {});
  const [registry, setRegistry] = useState<Registry | null>(null);
  useEffect(() => {
    void getRegistry().then(setRegistry);
  }, []);
  const ref = assignments[stage];
  if (!ref) return null;
  const provider = registry?.get(ref.provider);
  return { provider: provider?.name ?? ref.provider, model: registry?.model(ref.provider, ref.model)?.name ?? ref.model, local: provider?.type === 'local' };
}

/** Línea de nivel bajo la nota (mockup Main): «RÁPIDO · LOCAL · QWEN 7B» / «COMPLETO · CLAUDE · 6 COBERTURAS · 9 FUENTES». */
export function useTier(result: AnalysisResult | null): (coverages: number, sources: number) => string {
  const { t } = useI18n();
  const used = useAssigned(result?.quick ? 'quickScore' : 'score');
  return (coverages, sources) => {
    if (!result) return '';
    const parts = [result.quick ? t('analysis.tier.quick') : t('analysis.tier.full')];
    if (used) parts.push(...(used.local ? [t('analysis.tier.local'), used.model] : [used.provider]));
    if (!result.quick) parts.push(t('analysis.tier.coverages', { n: coverages }), t('analysis.tier.sources', { n: sources }));
    return parts.join(' · ');
  };
}
