import { useT } from '@newpaper/i18n/react';
import { useAiSettings } from '../ai/pipeline';

/** Segunda línea de «Inteligencia artificial» en la barra lateral de Ajustes. */
export function AiSummary() {
  const t = useT();
  const { connected } = useAiSettings();
  return <>{connected.length ? t('settings.ai.summary') : t('settings.ai.summaryNone')}</>;
}

/** Segunda línea de «Análisis»: cuándo se analiza una noticia. */
export function AnalysisSummary() {
  const t = useT();
  const { autoFull, quickOnOpen } = useAiSettings();
  return <>{t(`settings.analysis.trigger.${autoFull ? 'auto' : quickOnOpen ? 'tiered' : 'demand'}`)}</>;
}
