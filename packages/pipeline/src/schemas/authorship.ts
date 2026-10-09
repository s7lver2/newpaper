import { z } from 'zod';

export const AiAuthorshipSchema = z.object({
  probability: z.number().min(0).max(1),
  paragraphs: z.array(z.object({ index: z.number().int().nonnegative(), probability: z.number().min(0).max(1) })),
  signals: z.array(z.object({ key: z.enum(['burstiness', 'templates', 'repetition', 'c2pa', 'llm']), value: z.number(), strength: z.number().min(0).max(1) })),
});
export type AiAuthorship = z.infer<typeof AiAuthorshipSchema>;
