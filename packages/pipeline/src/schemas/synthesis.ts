import { z } from 'zod';
import { VisualizationSchema } from './visualization';

export const SynthesisSchema = z.object({
  headline: z.string().min(1),
  summary3: z.array(z.string().min(1)).length(3),
  facts: z.array(z.object({ id: z.string(), text: z.string(), kind: z.enum(['hecho', 'atribuida', 'disputa']), sourceIds: z.array(z.string()) })),
  parties: z.array(z.object({ who: z.string(), says: z.string(), sourceId: z.string() })),
  disputes: z.array(
    z.object({
      question: z.string(),
      positions: z.array(z.object({ id: z.string(), claim: z.string(), who: z.string(), evidenceWeight: z.number().min(0).max(1), detail: z.string() })),
      conclusion: z.string().optional(),
    }),
  ),
  unknowns: z.array(z.string()),
  visualizations: z.array(VisualizationSchema),
  rewrites: z.array(z.object({ from: z.string().min(1), to: z.string(), reason: z.string() })),
});
export type Synthesis = z.infer<typeof SynthesisSchema>;
