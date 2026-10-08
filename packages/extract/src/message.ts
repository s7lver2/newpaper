import { LIMITS, type NewsSignals } from './article';
import { extractArticle } from './extract';
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
}
export interface NavMessage { type: 'nav'; url: string; title: string }
export interface ShortcutMessage { type: 'shortcut'; action: ShortcutAction }

export function buildPageMessage(doc: Document, url: string): PageMessage {
  const signals = collectSignals(doc);
  const a = extractArticle(doc, url);
  if (!a) {
    return {
      type: 'page', article: false, url, title: (doc.title || '').slice(0, LIMITS.title),
      byline: null, siteName: null, published: null, lang: doc.documentElement.lang || null,
      html: '', text: '', excerpt: null, signals,
    };
  }
  return { type: 'page', article: true, ...a, signals };
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
