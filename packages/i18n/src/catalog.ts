import es from '../locales/es.json';
import en from '../locales/en.json';
import de from '../locales/de.json';

export const LOCALES = ['es', 'en', 'de'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'es';

export interface MessageTree {
  [key: string]: string | MessageTree;
}

export function flatten(tree: MessageTree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

export const catalogs: Record<Locale, Record<string, string>> = {
  es: flatten(es as MessageTree),
  en: flatten(en as MessageTree),
  de: flatten(de as MessageTree),
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}