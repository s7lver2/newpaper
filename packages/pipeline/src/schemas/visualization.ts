import { z } from 'zod';

const base = { title: z.string().min(1), unit: z.string().optional(), sourceIds: z.array(z.string()).min(1) };
const point = z.object({ x: z.string(), y: z.number(), provisional: z.boolean().optional() });

export const VisualizationSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('bar'), data: z.object({ points: z.array(point).min(1) }) }),
  z.object({ ...base, type: z.literal('line'), data: z.object({ points: z.array(point).min(2) }) }),
  z.object({ ...base, type: z.literal('range'), data: z.object({ min: z.number(), max: z.number(), ranges: z.array(z.object({ label: z.string(), from: z.number(), to: z.number() })).min(1) }) }),
  z.object({ ...base, type: z.literal('stacked'), data: z.object({ categories: z.array(z.string()).min(1), rows: z.array(z.object({ label: z.string(), values: z.array(z.number()) })).min(1) }) }),
  z.object({ ...base, type: z.literal('matrix'), data: z.object({ columns: z.array(z.string()).min(1), rows: z.array(z.object({ label: z.string(), cells: z.array(z.enum(['si', 'par', 'mal', 'no'])) })).min(1) }) }),
  z.object({ ...base, type: z.literal('table'), data: z.object({ columns: z.array(z.string()).min(1), rows: z.array(z.array(z.union([z.string(), z.number()]))).min(1) }) }),
  z.object({
    ...base,
    type: z.literal('parliament'),
    data: z.object({
      chamber: z.enum(['congreso', 'commons', 'bundestag']),
      total: z.number().int().positive(),
      majority: z.number().int().positive(),
      /** Una o dos series (legislaturas, o resultado frente a encuesta). `partyId` = id de `config/parties-<locale>.json`. */
      series: z.array(z.object({ label: z.string(), seats: z.array(z.object({ partyId: z.string(), seats: z.number().int().nonnegative() })).min(1) })).min(1).max(2),
    }),
  }),
  z.object({ ...base, type: z.literal('map'), data: z.object({ regions: z.array(z.object({ code: z.string(), value: z.number() })).min(1) }) }),
]);
export type Visualization = z.infer<typeof VisualizationSchema>;
