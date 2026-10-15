import { useI18n } from '@newpaper/i18n/react';
import { estimateAnalysis, type Assignments, type Registry, type StageId } from '@newpaper/pipeline';
import { useMemo } from 'react';

/** Un artículo de 6.000 caracteres con 5 coberturas: la medida de todas las estimaciones de coste y tiempo. */
const SAMPLE = 'x'.repeat(6000);

export type StepId = 'extract' | 'claims' | 'search' | 'verify' | 'score' | 'synthesis' | 'aiDetect' | 'agent';
export interface StepDef {
  id: StepId;
  /** Etapa del pipeline que lo ejecuta; sin etapa, el paso no usa un modelo. */
  stage?: StageId;
  /** Marca en el nodo (los demás llevan su número). */
  glyph?: string;
  /** Veces que el paso gasta un modelo en un análisis (el mockup pondera la verificación y la síntesis al doble). */
  weight: number;
  optional?: boolean;
}

/** Los ocho pasos del mockup Ajustes.dc.html, en orden. */
export const STEPS: StepDef[] = [
  { id: 'extract', glyph: '¶', weight: 0 },
  { id: 'claims', stage: 'claims', weight: 1 },
  { id: 'search', glyph: '⌕', weight: 0 },
  { id: 'verify', stage: 'verify', weight: 2 },
  { id: 'score', stage: 'score', weight: 1 },
  { id: 'synthesis', stage: 'synthesis', weight: 2 },
  { id: 'aiDetect', stage: 'aiDetect', weight: 0.5, optional: true },
  { id: 'agent', stage: 'agent', weight: 1 },
];

const LATENCY_SECONDS = { fast: 1.5, medium: 4, slow: 9 } as const;

/** Coste en USD de un paso (`null` si el modelo no tiene precio, 0 si es local). */
export function stepCosts(registry: Registry, a: Assignments): Partial<Record<StageId, number | null>> {
  const out: Partial<Record<StageId, number | null>> = {};
  for (const s of estimateAnalysis(registry, a, SAMPLE, 5).perStage) out[s.stage] = s.usd;
  return out;
}

export function stepSeconds(registry: Registry, a: Assignments, step: StepDef): number {
  const x = step.stage ? a[step.stage] : undefined;
  if (!x) return 0;
  const lat = registry.model(x.provider, x.model)?.latency ?? 'medium';
  return LATENCY_SECONDS[lat] * step.weight;
}

/** Importes en dólares (los precios del registro lo son) con el símbolo corto, que cabe en las columnas del mockup. */
const INTL_TAG = { es: 'es-ES', en: 'en-GB', de: 'de-DE' } as const;
export function useUsd(whole = false): (n: number) => string {
  const { locale } = useI18n();
  return useMemo(() => {
    const nf = new Intl.NumberFormat(INTL_TAG[locale as keyof typeof INTL_TAG] ?? 'es-ES', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', ...(whole ? { maximumFractionDigits: 0 } : {}) });
    return (n: number) => nf.format(n + 0); // + 0: -0 saldría como «-0»
  }, [locale, whole]);
}

/** 0 → «gratis»; por debajo de un céntimo → «<0,01 $»; si no, el importe (con «~» cuando es una estimación). */
export function money(v: number | null | undefined, fmt: (n: number) => string, free: string, opts: { approx?: boolean } = {}): string {
  if (v === null || v === undefined) return '—';
  if (v === 0) return free;
  if (v < 0.01) return `<${fmt(0.01)}`;
  return `${opts.approx ? '~' : ''}${fmt(v)}`;
}

/** Nombre visible de cada proveedor en el asistente y en Ajustes (el mockup los nombra distinto: «ChatGPT / OpenAI», «Gemini / Google»). */
export const WIZARD_NAME: Record<string, string> = {
  openai: 'ChatGPT', nous: 'Nous Research', anthropic: 'Anthropic', google: 'Gemini', deepseek: 'DeepSeek', xai: 'xAI', mistral: 'Mistral',
  nvidia: 'NVIDIA NIM', openrouter: 'OpenRouter', groq: 'Groq', huggingface: 'Hugging Face', ollama: 'Ollama', lmstudio: 'LM Studio',
};
export const SETTINGS_NAME: Record<string, string> = { ...WIZARD_NAME, openai: 'OpenAI', google: 'Google' };
