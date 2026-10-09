import type { NewsSignals } from './article';
import { isPlaceholderSrc, parseSrcset } from './images';
import { isCtaText } from './paywall';

/** Titular de un listado (portada, sección, etiqueta, búsqueda). */
export interface ListingItem {
  title: string;
  url: string;
  summary?: string;
  image?: string;
  section?: string;
}

export type PageClass = 'article' | 'listing' | 'other';

export const MAX_ITEMS = 120;
export const MIN_ITEMS = 5;

const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu']);

/** Dominio registrable aproximado: `www.elpais.com` → `elpais.com`, `www.bbc.co.uk` → `bbc.co.uk`. */
export function siteKey(host: string): string {
  const labels = host.toLowerCase().replace(/^www\./, '').split('.');
  if (labels.length <= 2) return labels.join('.');
  const last = labels[labels.length - 1] ?? '';
  const second = labels[labels.length - 2] ?? '';
  const take = last.length === 2 && SECOND_LEVEL.has(second) ? 3 : 2;
  return labels.slice(-take).join('.');
}

const DATE_IN_PATH = /\/(?:19|20)\d\d(?:[/-]\d\d?){0,2}(?:\/|$)/;
const NUMERIC_ID = /[-/_](?:\d{6,}|[a-z]\d{5,})(?:[/.#?]|$)/i;
const LISTING_SEGMENT = /^(?:tag|tags|etiqueta|etiquetas|tema|temas|topic|topics|seccion|secciones|section|sections|category|categoria|categorias|search|buscar|busqueda|archivo|archive|author|autor|autores|firmas|page|pagina|ultimas-noticias|latest|news|noticias)$/i;

const segments = (path: string): string[] => path.split('/').filter(Boolean);

/** El slug de la última parte parece de un artículo (largo, con guiones o con extensión). */
function looksLikeArticlePath(path: string): boolean {
  const segs = segments(path);
  if (!segs.length) return false;
  if (DATE_IN_PATH.test(path) || NUMERIC_ID.test(path)) return true;
  const last = (segs[segs.length - 1] ?? '').replace(/\.(?:html?|php|aspx?)$/i, '');
  return (last.match(/-/g)?.length ?? 0) >= 4;
}

/** 0 = no parece listado por la URL; mayor = más probable. */
export function listingPathScore(url: string): number {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 0;
  }
  const segs = segments(u.pathname);
  if (!segs.length) return 3;
  if (looksLikeArticlePath(u.pathname)) return 0;
  if (segs.some((s) => LISTING_SEGMENT.test(s))) return 2;
  if (u.searchParams.has('q') || u.searchParams.has('s') || u.searchParams.has('query')) return 2;
  return segs.length <= 2 ? 2 : 0;
}

const NAV_SELECTOR = 'nav, footer, [role="navigation"], [role="banner"], [role="contentinfo"], [class*="menu" i], [class*="cookie" i], [class*="consent" i], [class*="newsletter" i], [class*="paywall" i], [class*="subscri" i], [aria-hidden="true"]';
const SKIP_PATH = /(?:suscri|subscri|abonn|login|signin|sign-in|registro|register|newsletter|cookies?|privacidad|privacy|aviso-legal|terms|condiciones|contacto|contact|rss|feed|mailto:)/i;

function absolute(href: string | null, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    for (const k of Array.from(u.searchParams.keys())) if (/^(?:utm_|fbclid|gclid|ref$|rel$|ssm$|outputType$)/i.test(k)) u.searchParams.delete(k);
    return u.href;
  } catch {
    return null;
  }
}

const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** Titulares enlazados (h1–h4 con enlace o enlace con titular dentro) fuera de menús y pies. */
function headlineAnchors(doc: Document): HTMLAnchorElement[] {
  const set = new Set<HTMLAnchorElement>();
  doc.querySelectorAll<HTMLAnchorElement>('h1 a[href], h2 a[href], h3 a[href], h4 a[href]').forEach((a) => set.add(a));
  doc.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    if (a.querySelector('h1, h2, h3, h4')) set.add(a);
  });
  return Array.from(set).filter((a) => !a.closest(NAV_SELECTOR) && !a.closest('header nav'));
}

export function classifyPage(doc: Document, url: string, signals: NewsSignals): { kind: PageClass; score: number } {
  const types = signals.jsonLdTypes;
  const articleType = signals.ogType === 'article' || types.some((t) => /Article$|^BlogPosting$/.test(t));
  const listingType = types.some((t) => /^(?:CollectionPage|ItemList|WebSite|SearchResultsPage|ProfilePage)$/.test(t));
  let listing = listingPathScore(url);
  if (listingType) listing += 2;
  if (signals.ogType === 'website') listing += 1;
  const anchors = headlineAnchors(doc);
  if (anchors.length >= 10) listing += 2;
  else if (anchors.length >= 6) listing += 1;
  if (doc.querySelectorAll('article').length >= 8) listing += 1;
  let article = 0;
  if (articleType) article += 3;
  if (looksLikeArticlePath(new URL(url, 'https://x.invalid').pathname)) article += 2;
  if (doc.querySelectorAll('time[datetime]').length === 1) article += 1;
  if (doc.querySelectorAll('h1').length === 1 && doc.querySelectorAll('article').length <= 2) article += 1;
  const score = listing - article;
  // Un artículo declarado (og:type / JSON-LD) nunca se trata como listado.
  if (articleType && article >= 3 && listing < 6) return { kind: 'article', score };
  if (listing >= 4 && score >= 2) return { kind: 'listing', score };
  return { kind: article > 0 ? 'article' : 'other', score };
}

function cardOf(a: Element): Element {
  return a.closest('article, li, [class*="card" i], [class*="story" i], [class*="item" i], [class*="teaser" i]') ?? a.parentElement ?? a;
}

function sectionOf(a: Element): string | undefined {
  let el: Element | null = a;
  while (el && el.tagName !== 'BODY') {
    let prev: Element | null = el;
    while (prev) {
      const h = prev.matches('h2, h3') ? prev : prev.querySelector(':scope > h2, :scope > header h2, :scope > h3');
      if (h && !h.closest('a[href]') && !h.querySelector('a[href]') && !h.contains(a)) {
        const t = clean(h.textContent);
        if (t && t.length <= 40) return t;
      }
      prev = prev.previousElementSibling;
      if (prev && prev.matches('article, li')) break;
    }
    el = el.parentElement;
    if (el && el.matches('main, body')) break;
  }
  return undefined;
}

function imageOf(card: Element, base: string): string | undefined {
  const img = card.querySelector('img');
  if (!img) return undefined;
  const cands = [
    ...parseSrcset(img.getAttribute('srcset') ?? ''),
    ...parseSrcset(img.getAttribute('data-srcset') ?? ''),
    ...Array.from(card.querySelectorAll('picture source')).flatMap((s) => parseSrcset(s.getAttribute('srcset') ?? s.getAttribute('data-srcset') ?? '')),
  ].filter((c) => !isPlaceholderSrc(c.url));
  // miniatura: la candidata más cercana a 480 px de ancho
  const sized = cands.filter((c) => c.width > 0).sort((x, y) => Math.abs(x.width - 480) - Math.abs(y.width - 480));
  const own = [img.getAttribute('src'), img.getAttribute('data-src'), img.getAttribute('data-lazy-src')].find((v) => !isPlaceholderSrc(v));
  const src = sized[0]?.url ?? cands[0]?.url ?? own;
  return src ? (absolute(src, base) ?? undefined) : undefined;
}

function summaryOf(card: Element, title: string): string | undefined {
  for (const p of Array.from(card.querySelectorAll('p, [class*="summary" i], [class*="excerpt" i], [class*="desc" i], [class*="standfirst" i]'))) {
    const t = clean(p.textContent);
    if (t.length >= 40 && t.length <= 280 && t !== title && !isCtaText(t) && !t.startsWith(title)) return t;
  }
  return undefined;
}

/** Titulares de un listado: mismo sitio, sin menús, sin llamadas a suscribirse, sin duplicados. */
export function extractListing(doc: Document, url: string): ListingItem[] {
  const site = siteKey(new URL(url).hostname);
  const here = absolute(url, url);
  const seen = new Set<string>();
  const items: ListingItem[] = [];
  for (const a of headlineAnchors(doc)) {
    const abs = absolute(a.getAttribute('href'), url);
    if (!abs || abs === here || seen.has(abs)) continue;
    let u: URL;
    try {
      u = new URL(abs);
    } catch {
      continue;
    }
    if (siteKey(u.hostname) !== site) continue;
    if (SKIP_PATH.test(u.pathname) || SKIP_PATH.test(u.search)) continue;
    // enlaces que a su vez son portadas o secciones no son titulares
    if (!looksLikeArticlePath(u.pathname) && listingPathScore(abs) >= 2) continue;
    const heading = a.matches('h1, h2, h3, h4') ? a : (a.querySelector('h1, h2, h3, h4') ?? a.closest('h1, h2, h3, h4') ?? a);
    const title = clean(heading.textContent);
    if (title.length < 18 || title.split(' ').length < 3 || isCtaText(title)) continue;
    seen.add(abs);
    const card = cardOf(a);
    const item: ListingItem = { title: title.slice(0, 240), url: abs };
    const summary = summaryOf(card, title);
    if (summary) item.summary = summary;
    const image = imageOf(card, url);
    if (image) item.image = image;
    const section = sectionOf(a);
    if (section) item.section = section;
    items.push(item);
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}
