import type { ProviderEntry } from '@newpaper/pipeline';

/** Las tres vistas de la lista completa: lo que se puede descargar, lo propietario y lo que corre en casa. */
export type Segment = 'open' | 'closed' | 'local';
export const SEGMENTS: Segment[] = ['open', 'closed', 'local'];
export type ProviderTag = 'free' | 'account' | 'local';

/** Todo lo que se puede conectar con un asistente de claves: sin el endpoint propio, que va aparte, al final. */
export const listable = (providers: ProviderEntry[]): ProviderEntry[] => providers.filter((p) => p.category !== 'advanced');

/** Segmento de un proveedor. Los agregadores (`mixed`) sirven de ambos y van con los abiertos, como en Ajustes. */
export function segmentOf(p: Pick<ProviderEntry, 'category' | 'openness'>): Segment {
  if (p.category === 'local') return 'local';
  return p.openness === 'closed' ? 'closed' : 'open';
}

/** Etiquetas en lenguaje llano: gratis, entra con tu cuenta (inicio de sesión disponible) o corre en tu equipo. */
export function tagsOf(p: ProviderEntry): ProviderTag[] {
  if (p.type === 'local') return ['local'];
  const tags: ProviderTag[] = [];
  if (p.freeTier) tags.push('free');
  if (p.login?.status === 'available') tags.push('account');
  return tags;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Filas de la lista completa. Con texto en el buscador se busca en TODOS los proveedores (sea cual sea el segmento
 * activo): quien escribe «claude» estando en «Abiertos» no debe ver una lista vacía. Sin texto, solo el segmento.
 */
export function chooserRows(providers: ProviderEntry[], opts: { query: string; segment: Segment; nameOf(p: ProviderEntry): string }): ProviderEntry[] {
  const q = fold(opts.query);
  const base = listable(providers);
  if (!q) return base.filter((p) => segmentOf(p) === opts.segment);
  return base.filter((p) => fold(opts.nameOf(p)).includes(q) || fold(p.name).includes(q) || p.id.includes(q));
}
