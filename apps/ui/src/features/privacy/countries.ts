/**
 * Países de salida de Tor. Las coordenadas son las del mockup (centro aproximado del país, no la capital),
 * porque son las que colocan bien el pin sobre la matriz de puntos de `worldMap.ts`.
 */
export const EXIT_COUNTRIES: { code: string; lat: number; lon: number }[] = [
  { code: 'DE', lat: 51, lon: 10 },
  { code: 'NL', lat: 52.2, lon: 5.3 },
  { code: 'FR', lat: 46.6, lon: 2.3 },
  { code: 'SE', lat: 60.1, lon: 15 },
  { code: 'CH', lat: 46.8, lon: 8.2 },
  { code: 'FI', lat: 62, lon: 26 },
  { code: 'NO', lat: 61, lon: 9 },
  { code: 'AT', lat: 47.6, lon: 14.5 },
  { code: 'LU', lat: 49.8, lon: 6.1 },
  { code: 'IS', lat: 64.9, lon: -18.5 },
  { code: 'RO', lat: 45.9, lon: 25 },
  { code: 'PL', lat: 52, lon: 19 },
  { code: 'CZ', lat: 49.8, lon: 15.5 },
  { code: 'ES', lat: 40.4, lon: -3.7 },
  { code: 'GB', lat: 53, lon: -1.5 },
  { code: 'US', lat: 39.8, lon: -98.6 },
  { code: 'CA', lat: 52, lon: -106 },
  { code: 'BR', lat: -14, lon: -51 },
  { code: 'JP', lat: 36, lon: 138 },
  { code: 'SG', lat: 1.35, lon: 103.8 },
  { code: 'AU', lat: -25, lon: 134 },
];

const BY_CODE = new Map(EXIT_COUNTRIES.map((c) => [c.code, c]));
export const countryCoords = (code: string | null): { lat: number; lon: number } | null => (code ? BY_CODE.get(code) ?? null : null);

const cache = new Map<string, Intl.DisplayNames>();

export function countryName(code: string, locale: string): string {
  let dn = cache.get(locale);
  if (!dn) {
    dn = new Intl.DisplayNames([locale], { type: 'region' });
    cache.set(locale, dn);
  }
  return dn.of(code) ?? code;
}
