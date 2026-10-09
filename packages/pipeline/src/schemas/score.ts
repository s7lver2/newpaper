import { z } from 'zod';

/** Señales observables de §5.2.1 (tabla de la spec). */
export const SignalKindSchema = z.enum(['lexico', 'encuadre', 'voces', 'atribucion', 'adjetivacion', 'omision', 'orden']);

export const SignalSchema = z.object({
  kind: SignalKindSchema,
  /** −1 (más a la izquierda que el grupo) … +1 (más a la derecha); 0 = como el centro del grupo. */
  value: z.number().min(-1).max(1),
  /** Fragmentos literales del texto que justifican la puntuación (sin cita, la señal no cuenta). */
  evidence: z.array(z.string()),
  source: z.enum(['lexicon', 'judge', 'computed']),
});

export const ScoreSchema = z
  .object({
    neutrality: z.number().min(0).max(100),
    framing: z.number().min(0).max(100).nullable(),
    confidence: z.number().min(0).max(1),
    interval: z.tuple([z.number(), z.number()]).nullable(),
    signals: z.array(SignalSchema),
    voices: z.object({ actors: z.array(z.object({ name: z.string(), quotes: z.number().int().nonnegative() })), lastWord: z.string().nullable() }),
    omissions: z.array(z.string()),
    verdict: z.enum(['neutral', 'sesgo_leve', 'sesgado', 'muy_sesgado', 'no_determinable']),
    judges: z.array(z.object({ model: z.string(), framing: z.number().nullable() })).optional(),
    crossModelDisagreement: z.boolean().optional(),
  })
  .refine((s) => (s.framing === null) === (s.verdict === 'no_determinable'), { message: 'framing is null exactly when not determinable' });

export type SignalKind = z.infer<typeof SignalKindSchema>;
export type Signal = z.infer<typeof SignalSchema>;
export type Score = z.infer<typeof ScoreSchema>;
