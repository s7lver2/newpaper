import { IntlMessageFormat } from 'intl-messageformat';
import { catalogs as defaultCatalogs, DEFAULT_LOCALE, isLocale, type Locale } from './catalog';

export type MessageValues = Record<string, string | number | Date | boolean>;

export interface Translator {
  readonly locale: Locale;
  t(key: string, values?: MessageValues): string;
  has(key: string): boolean;
  formatDate(date: Date | number, options?: Intl.DateTimeFormatOptions): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
  formatCurrency(value: number, currency: string): string;
  formatRelativeDays(days: number): string;
}

const INTL_TAG: Record<Locale, string> = { es: 'es-ES', en: 'en-GB', de: 'de-DE' };

export function createTranslator(
  locale: Locale,
  source: Record<Locale, Record<string, string>> = defaultCatalogs,
): Translator {
  const tag = INTL_TAG[locale];
  const cache = new Map<string, IntlMessageFormat>();
  const lookup = (key: string): { msg: string; loc: Locale } | undefined => {
    const own = source[locale]?.[key];
    if (own !== undefined) return { msg: own, loc: locale };
    const fallback = source[DEFAULT_LOCALE]?.[key];
    return fallback !== undefined ? { msg: fallback, loc: DEFAULT_LOCALE } : undefined;
  };
  return {
    locale,
    t(key, values) {
      const found = lookup(key);
      if (!found) return key;
      const cacheKey = `${found.loc}\u0000${key}`;
      let fmt = cache.get(cacheKey);
      if (!fmt) {
        fmt = new IntlMessageFormat(found.msg, INTL_TAG[found.loc]);
        cache.set(cacheKey, fmt);
      }
      return String(fmt.format(values));
    },
    has: (key) => source[locale]?.[key] !== undefined,
    formatDate: (date, options) => new Intl.DateTimeFormat(tag, options).format(date),
    formatNumber: (value, options) => new Intl.NumberFormat(tag, options).format(value),
    formatCurrency: (value, currency) => new Intl.NumberFormat(tag, { style: 'currency', currency }).format(value),
    formatRelativeDays: (days) => new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }).format(days, 'day'),
  };
}

export function resolveLocale(candidates: readonly string[]): Locale {
  for (const c of candidates) {
    const base = c.toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}