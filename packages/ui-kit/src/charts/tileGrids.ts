/** Cartogramas de teselas: [columna, fila]. Una casilla por región; sin geometrías. */
export const TILE_GRIDS = {
  eu: {
    SE: [5, 0], FI: [6, 0], IE: [1, 1], DK: [4, 1], EE: [6, 1], NL: [3, 2], DE: [4, 2], PL: [5, 2], LV: [6, 2],
    BE: [2, 3], LU: [3, 3], CZ: [4, 3], SK: [5, 3], LT: [6, 3], FR: [2, 4], AT: [4, 4], HU: [5, 4], RO: [6, 4],
    PT: [0, 5], ES: [1, 5], IT: [3, 5], SI: [4, 5], HR: [5, 5], BG: [6, 5], MT: [3, 6], GR: [6, 6], CY: [7, 6],
  },
  es: {
    'ES-GA': [0, 0], 'ES-AS': [1, 0], 'ES-CB': [2, 0], 'ES-PV': [3, 0], 'ES-NC': [4, 0],
    'ES-CL': [1, 1], 'ES-RI': [3, 1], 'ES-AR': [4, 1], 'ES-CT': [5, 1],
    'ES-EX': [0, 2], 'ES-MD': [2, 2], 'ES-CM': [3, 2], 'ES-VC': [4, 2], 'ES-IB': [6, 2],
    'ES-AN': [1, 3], 'ES-MC': [4, 3], 'ES-CN': [0, 4], 'ES-CE': [2, 4], 'ES-ML': [3, 4],
  },
  de: {
    'DE-SH': [2, 0], 'DE-HB': [1, 1], 'DE-HH': [2, 1], 'DE-MV': [3, 1], 'DE-NW': [0, 2], 'DE-NI': [1, 2], 'DE-ST': [2, 2], 'DE-BE': [3, 2],
    'DE-BB': [4, 2], 'DE-RP': [0, 3], 'DE-HE': [1, 3], 'DE-TH': [2, 3], 'DE-SN': [3, 3], 'DE-SL': [0, 4], 'DE-BW': [1, 4], 'DE-BY': [2, 4],
  },
  gb: { 'GB-SCT': [1, 0], 'GB-NIR': [0, 1], 'GB-WLS': [0, 2], 'GB-ENG': [1, 2] },
} satisfies Record<string, Record<string, [number, number]>>;

export type GridId = keyof typeof TILE_GRIDS;

export function gridFor(codes: string[]): GridId | null {
  for (const id of Object.keys(TILE_GRIDS) as GridId[]) {
    const g = TILE_GRIDS[id] as Record<string, [number, number]>;
    if (codes.every((c) => c.toUpperCase() in g)) return id;
  }
  return null;
}
