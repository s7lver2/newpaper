import { z } from 'zod';

export const SourceSchema = z.object({ id: z.string(), url: z.string().url(), title: z.string(), kind: z.enum(['primary', 'coverage']) });
export const VerdictStatusSchema = z.enum(['verificado', 'enganoso', 'falso', 'falta_contexto', 'opinion', 'no_verificable']);
export const VerdictSchema = z.object({ claimId: z.string(), status: VerdictStatusSchema, explanation: z.string(), sources: z.array(SourceSchema) });

export type Source = z.infer<typeof SourceSchema>;
export type VerdictStatus = z.infer<typeof VerdictStatusSchema>;
export type Verdict = z.infer<typeof VerdictSchema>;
