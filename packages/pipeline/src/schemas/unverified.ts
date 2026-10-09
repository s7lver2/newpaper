import { z } from 'zod';
import { SourceSchema } from './verdicts';

export const UnverifiedReportSchema = z.object({
  unverified: z.literal(true),
  confidence: z.number().min(0).max(0.5),
  claims: z.array(z.object({ text: z.string(), tag: z.enum(['fuente_unica', 'solo_redes', 'varias_no_oficiales', 'sin_fuente']), note: z.string() })),
  howToCheck: z.array(z.string()).min(1),
  sources: z.array(SourceSchema),
});
export type UnverifiedReport = z.infer<typeof UnverifiedReportSchema>;
