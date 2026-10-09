import type { OutletLean } from '../../ipc/types';

export type Side = 'left' | 'center' | 'right';

/** Franja de una posición 0–100 (mismos umbrales que las coberturas: ≤40 izquierda, ≥60 derecha). */
export const sideOf = (v: number): Side => (v <= 40 ? 'left' : v >= 60 ? 'right' : 'center');

/** Clave i18n de la etiqueta de una posición. */
export const leanLabelKey = (v: number): string =>
  v < 20 ? 'sources.lean.left' : v < 40 ? 'sources.lean.centerLeft' : v <= 60 ? 'sources.lean.center' : v <= 80 ? 'sources.lean.centerRight' : 'sources.lean.right';

export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/** Alto y separación de las etiquetas del eje (mockup Ajustes › Fuentes). */
export const PILL_H = 28;
export const LANE_PITCH = 34;
const PILL_TOP = 6;
const PILL_GAP = 6;

/** Ancho aproximado de una etiqueta (12 px Plex Sans + 10 px de relleno a cada lado + 1,5 px de borde). */
export const pillWidth = (name: string) => Math.round(name.length * 5.7 + 23);

export interface PlacedPill { outlet: OutletLean; x: number; top: number; lane: number }
export interface AxisLayout { pills: PlacedPill[]; lineY: number; height: number }

/**
 * Reparte las etiquetas en carriles (mitad por encima y mitad por debajo de la línea) para que no se solapen.
 * Con 4 carriles son exactamente los del mockup (6, 40 | línea 75 | 88, 122; alto 150); si hay muchos medios
 * se añaden carriles de dos en dos hasta 8.
 */
export function layoutAxis(placed: OutletLean[], width: number): AxisLayout {
  const sorted = [...placed].sort((a, b) => (a.effective as number) - (b.effective as number));
  for (const lanes of [4, 6, 8]) {
    const half = lanes / 2;
    const lineY = PILL_TOP + LANE_PITCH * (half - 1) + PILL_H + 7;
    const belowTop = lineY + 13;
    const tops = [
      ...Array.from({ length: half }, (_, i) => PILL_TOP + LANE_PITCH * i),
      ...Array.from({ length: half }, (_, i) => belowTop + LANE_PITCH * i),
    ];
    // Orden de preferencia: alterna por encima y por debajo, empezando por los carriles más cercanos a la línea.
    const order = Array.from({ length: half }, (_, i) => [half - 1 - i, half + i]).flat();
    const edge = new Array<number>(lanes).fill(-Infinity);
    const pills: PlacedPill[] = [];
    let clean = true;
    for (const o of sorted) {
      const x = ((o.effective as number) / 100) * width;
      const w = pillWidth(o.name);
      const left = x - w / 2;
      let lane = order.find((l) => left >= edge[l]! + PILL_GAP);
      if (lane === undefined) {
        clean = false;
        lane = order.reduce((best, l) => (edge[l]! < edge[best]! ? l : best), order[0]!);
      }
      edge[lane] = Math.max(edge[lane]!, x + w / 2);
      pills.push({ outlet: o, x: (o.effective as number), top: tops[lane]!, lane });
    }
    if (clean || lanes === 8) return { pills, lineY, height: belowTop + LANE_PITCH * (half - 1) + PILL_H };
  }
  return { pills: [], lineY: 75, height: 150 };
}
