import { z } from 'zod';

/** Lo que devuelve el comando `coverage_for` del subproyecto 3. */
export const CoverageSchema = z.object({
  outletId: z.string(),
  outlet: z.string(),
  url: z.string(),
  title: z.string(),
  lean: z.number().nullable(),
  leanUncertainty: z.number().nullable().optional(),
  bucket: z.enum(['left', 'center', 'right', 'unknown']),
  publishedAt: z.number().optional(),
});
export type Coverage = z.infer<typeof CoverageSchema>;
