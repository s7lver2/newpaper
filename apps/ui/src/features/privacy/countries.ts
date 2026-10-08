/** Países de salida frecuentes en Tor con coordenadas aproximadas de la capital. */
export const EXIT_COUNTRIES: { code: string; lat: number; lon: number }[] = [
  { code: 'DE', lat: 52.5, lon: 13.4 },
  { code: 'NL', lat: 52.4, lon: 4.9 },
  { code: 'FR', lat: 48.9, lon: 2.4 },
  { code: 'SE', lat: 59.3, lon: 18.1 },
  { code: 'CH', lat: 46.9, lon: 7.4 },
  { code: 'FI', lat: 60.2, lon: 24.9 },
  { code: 'NO', lat: 59.9, lon: 10.8 },
  { code: 'AT', lat: 48.2, lon: 16.4 },
  { code: 'LU', lat: 49.6, lon: 6.1 },
  { code: 'IS', lat: 64.1, lon: -21.9 },
  { code: 'RO', lat: 44.4, lon: 26.1 },
  { code: 'PL', lat: 52.2, lon: 21.0 },
  { code: 'CZ', lat: 50.1, lon: 14.4 },
  { code: 'ES', lat: 40.4, lon: -3.7 },
  { code: 'GB', lat: 51.5, lon: -0.1 },
  { code: 'US', lat: 38.9, lon: -77.0 },
  { code: 'CA', lat: 45.4, lon: -75.7 },
];

const cache = new Map<string, Intl.DisplayNames>();

export function countryName(code: string, locale: string): string {
  let dn = cache.get(locale);
  if (!dn) {
    dn = new Intl.DisplayNames([locale], { type: 'region' });
    cache.set(locale, dn);
  }
  return dn.of(code) ?? code;
}
