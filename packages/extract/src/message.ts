import { LIMITS, type NewsSignals } from './article';
import { extractArticle } from './extract';
import { classifyPage, extractListing, MIN_ITEMS, type ListingItem } from './listing';
import { collectSignals } from './signals';

export type ShortcutAction = 'focus-address' | 'new-tab' | 'analyze' | 'ask-agent';

export interface PageMessage {
  type: 'page';
  article: boolean;
  url: string;
  title: string;
  byline: string | null;
  siteName: string | null;
  published: string | null;
  lang: string | null;
  html: string;
  text: string;
  excerpt: string | null;
  signals: NewsSignals;
  /** Artículo limitado por suscripción (solo lo que la página entrega). */
  limited: boolean;
  /** `article` (lector), `listing` (portada o sección: selector de artículos) u `other`. */
  kind: 'article' | 'listing' | 'other';
  items: ListingItem[];
}
export interface NavMessage { type: 'nav'; url: string; title: string }
export interface ShortcutMessage { type: 'shortcut'; action: ShortcutAction }

export function buildPageMessage(doc: Document, url: string): PageMessage {
  const signals = collectSignals(doc);
  const base = {
    type: 'page' as const, url, title: (doc.title || '').slice(0, LIMITS.title),
    byline: null, siteName: null, published: null, lang: doc.documentElement.lang || null,
    html: '', text: '', excerpt: null, signals, limited: false, items: [] as ListingItem[],
  };
  // Portadas, secciones y búsquedas no son artículos: se ofrecen como selector de artículos.
  if (classifyPage(doc, url, signals).kind === 'listing') {
    const items = extractListing(doc, url);
    if (items.length >= MIN_ITEMS) {
      const site = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content')?.trim() || null;
      return { ...base, article: false, kind: 'listing', siteName: site, excerpt: null, items };
    }
    return { ...base, article: false, kind: 'other' };
  }
  const a = extractArticle(doc, url);
  if (!a) return { ...base, article: false, kind: 'other' };
  return { ...base, ...a, article: true, kind: 'article', items: [] };
}

export function shortcutFor(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): ShortcutAction | null {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod || e.altKey) return null;
  const key = e.key.toLowerCase();
  if (e.shiftKey) return key === 'a' ? 'analyze' : null;
  if (key === 'l') return 'focus-address';
  if (key === 't') return 'new-tab';
  if (key === 'k') return 'ask-agent';
  return null;
}
