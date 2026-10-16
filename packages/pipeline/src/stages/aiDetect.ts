import { z } from 'zod';
import { delimit, UNTRUSTED_NOTE } from '../llm/delimit';
import type { OutputLocale } from '../llm/language';
import { generateStructured } from '../llm/structured';
import type { AiAuthorship } from '../schemas/authorship';
import { ZERO_USAGE, type StageCtx, type StageResult } from './ctx';

export const TEMPLATE_PHRASES: Record<OutputLocale, string[]> = {
  es: ['es importante destacar', 'es importante señalar', 'es importante subrayar', 'cabe señalar', 'cabe destacar', 'en conclusión', 'en definitiva', 'en resumen', 'sin lugar a dudas', 'en el panorama actual', 'juega un papel crucial'],
  en: ['it is important to note', 'it is worth noting', 'in conclusion', 'in summary', 'plays a crucial role', 'in today\'s landscape', 'delve into', 'a testament to'],
  de: ['es ist wichtig zu beachten', 'zusammenfassend', 'abschließend lässt sich sagen', 'spielt eine entscheidende rolle', 'es sei darauf hingewiesen'],
};

const sentences = (p: string) => p.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Señales por párrafo (cada una 0–1; 1 = más propio de texto generado). Son indicios, nunca pruebas. */
export function paragraphSignals(paragraph: string, locale: OutputLocale) {
  const ss = sentences(paragraph);
  const lens = ss.map((s) => s.split(/\s+/).length);
  const mean = lens.reduce((a, b) => a + b, 0) / Math.max(1, lens.length);
  const sd = Math.sqrt(lens.reduce((n, l) => n + (l - mean) ** 2, 0) / Math.max(1, lens.length));
  const cv = mean ? sd / mean : 1;
  // Baja variación de longitud (poca "burstiness") = más propio de texto generado.
  const burstiness = ss.length < 3 ? 0.3 : clamp01(1 - cv / 0.6);
  const low = paragraph.toLowerCase();
  const templates = clamp01(TEMPLATE_PHRASES[locale].filter((t) => low.includes(t)).length / 2);
  const openings = ss.map((s) => s.toLowerCase().split(/\s+/).slice(0, 2).join(' '));
  const repeated = openings.length - new Set(openings).size;
  const repetition = ss.length < 3 ? 0 : clamp01(repeated / (ss.length - 1));
  return { burstiness, templates, repetition };
}

const LlmSchema = z.object({ paragraphs: z.array(z.object({ index: z.number().int().nonnegative(), probability: z.number().min(0).max(1) })) });

export async function detectAiText(o: { text: string; locale: OutputLocale; c2pa: { images: number; withCredentials: number } | null; ctx?: StageCtx }): Promise<StageResult<AiAuthorship>> {
  const paras = o.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const sig = paras.map((p) => paragraphSignals(p, o.locale));
  const c2paMissing = o.c2pa && o.c2pa.images > 0 ? 1 - o.c2pa.withCredentials / o.c2pa.images : null;
  let probs = sig.map((s) => clamp01(0.4 * s.burstiness + 0.35 * s.templates + 0.25 * s.repetition));
  let usage = ZERO_USAGE;
  const avg = (k: keyof (typeof sig)[number]) => sig.reduce((n, s) => n + s[k], 0) / Math.max(1, sig.length);
  const signals: AiAuthorship['signals'] = [
    { key: 'burstiness', value: avg('burstiness'), strength: avg('burstiness') },
    { key: 'templates', value: avg('templates'), strength: avg('templates') },
    { key: 'repetition', value: avg('repetition'), strength: avg('repetition') },
  ];
  if (c2paMissing !== null) signals.push({ key: 'c2pa', value: c2paMissing, strength: 0.3 * c2paMissing });
  if (o.ctx) {
    const r = await generateStructured({
      model: o.ctx.model,
      schema: LlmSchema,
      system: `Estimate for each numbered paragraph the probability (0–1) that it was machine-generated. This is a weak hint, not proof.\n${UNTRUSTED_NOTE}`,
      prompt: paras.map((p, i) => delimit(`P${i}`, p)).join('\n'),
      stage: 'aiDetect',
      temperature: 0,
      noTemperature: o.ctx.noTemperature,
      maxOutputTokens: o.ctx.maxOutputTokens,
      providerOptions: o.ctx.providerOptions,
      signal: o.ctx.signal,
    });
    usage = r.usage;
    const llm = new Map(r.object.paragraphs.map((p) => [p.index, p.probability]));
    probs = probs.map((p, i) => (llm.has(i) ? (p + llm.get(i)!) / 2 : p));
    const llmAvg = [...llm.values()].reduce((a, b) => a + b, 0) / Math.max(1, llm.size);
    signals.push({ key: 'llm', value: llmAvg, strength: llmAvg });
  }
  const probability = clamp01(probs.reduce((a, b) => a + b, 0) / Math.max(1, probs.length) * (c2paMissing !== null ? 0.9 + 0.1 * c2paMissing : 1));
  return { value: { probability, paragraphs: probs.map((p, i) => ({ index: i, probability: p })), signals }, usage };
}
