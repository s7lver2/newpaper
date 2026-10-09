import type { AnalysisResult } from '@newpaper/pipeline';
import { paragraphRanges } from '@newpaper/ui-kit';

/** Un párrafo se marca al margen con «IA» a partir de esta probabilidad (el detector solo da indicios). */
export const AI_PARAGRAPH_THRESHOLD = 0.7;
/** El aviso del detector aparece con esta probabilidad total o si algún párrafo supera el umbral. */
export const AI_BANNER_THRESHOLD = 0.5;

type AiAuthorship = NonNullable<AnalysisResult['aiAuthorship']>;

export function aiParagraphs(text: string, ai: AiAuthorship): { total: number; flagged: number; indexes: Set<number> } {
  const indexes = new Set(ai.paragraphs.filter((p) => p.probability >= AI_PARAGRAPH_THRESHOLD).map((p) => p.index));
  return { total: Math.max(paragraphRanges(text).length, ai.paragraphs.length), flagged: indexes.size, indexes };
}

/** Devuelve la detección solo si merece un aviso (indicio, nunca prueba). */
export function notableAi(text: string, ai: AiAuthorship | null | undefined): { ai: AiAuthorship; paras: ReturnType<typeof aiParagraphs> } | null {
  if (!ai) return null;
  const paras = aiParagraphs(text, ai);
  return ai.probability >= AI_BANNER_THRESHOLD || paras.flagged > 0 ? { ai, paras } : null;
}
