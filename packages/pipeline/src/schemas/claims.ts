import { z } from 'zod';

const Span = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]);

export const ClaimSchema = z.object({
  id: z.string(),
  quote: z.string().min(1),
  span: Span,
  kind: z.enum(['hecho', 'cifra', 'opinion', 'atribucion']),
  checkable: z.boolean(),
});
export const LoadedPhraseSchema = z.object({ quote: z.string().min(1), span: Span, reason: z.string() });
export const ClaimsOutputSchema = z.object({ claims: z.array(ClaimSchema), loadedPhrases: z.array(LoadedPhraseSchema) });

export type Claim = z.infer<typeof ClaimSchema>;
export type LoadedPhrase = z.infer<typeof LoadedPhraseSchema>;
export type ClaimsOutput = z.infer<typeof ClaimsOutputSchema>;

/**
 * Lo que se le pide al modelo: solo la cita literal, sin desplazamientos. Los números de carácter que devuelven
 * los modelos no son fiables (y `prefixItems` de las tuplas lo rechaza la salida estructurada de Gemini): la posición
 * la calcula el pipeline buscando la cita en el texto. `id` y `span` se aceptan si llegan, pero se ignoran.
 */
export const LlmClaimSchema = z.object({
  quote: z.string().min(1),
  kind: z.enum(['hecho', 'cifra', 'opinion', 'atribucion']),
  checkable: z.boolean(),
});
export const LlmLoadedPhraseSchema = z.object({ quote: z.string().min(1), reason: z.string() });
export const LlmClaimsOutputSchema = z.object({ claims: z.array(LlmClaimSchema), loadedPhrases: z.array(LlmLoadedPhraseSchema) });
export type LlmClaimsOutput = z.infer<typeof LlmClaimsOutputSchema>;
