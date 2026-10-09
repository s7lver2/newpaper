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
