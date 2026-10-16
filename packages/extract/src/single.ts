/**
 * Un artículo, no varios seguidos.
 *
 * Algunas páginas llevan en el mismo DOM más de una noticia completa: la actual y las siguientes que el
 * medio precarga ("scroll infinito", "siguiente noticia"), módulos de "recomendadas" con el texto entero o
 * un listado de piezas. Readability se queda con el contenedor común y el lector acaba mostrando varias
 * noticias una tras otra. Aquí se elige la noticia que corresponde a la URL de la página y se quita el resto.
 */

const ARTICLE_SELECTOR = 'article, [itemscope][itemtype*="Article" i], [itemscope][itemtype*="BlogPosting" i]';
const HEADING = 'h1, h2, h3';
const MIN_CANDIDATE_CHARS = 200;

const textOf = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Minúsculas, sin acentos ni signos: para comparar titulares. */
const norm = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

function pathOf(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return null;
  }
}

function ldHeadlines(doc: Document): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    if (typeof o.headline === 'string') out.push(o.headline);
    if (o['@graph']) walk(o['@graph']);
  };
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
    try {
      walk(JSON.parse(s.textContent ?? ''));
    } catch {
      /* JSON-LD roto: se ignora */
    }
  });
  return out;
}

interface PageIdentity {
  /** Rutas (host + path) con las que se identifica esta página: URL, canonical, og:url. */
  paths: Set<string>;
  /** Titulares normalizados de la página: og:title, `<title>`, primer h1, JSON-LD. */
  titles: string[];
}

function identityOf(doc: Document, url: string): PageIdentity {
  const paths = new Set<string>();
  for (const h of [url, doc.querySelector('link[rel="canonical"]')?.getAttribute('href'), doc.querySelector('meta[property="og:url"]')?.getAttribute('content')]) {
    const p = pathOf(h, url);
    if (p) paths.add(p);
  }
  const raw = [
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content'),
    doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content'),
    doc.querySelector('h1')?.textContent,
    doc.title,
    ...ldHeadlines(doc),
  ];
  const titles = raw.map((t) => norm(t ?? '')).filter((t) => t.length >= 12);
  return { paths, titles };
}

/** El titular `h` (normalizado) es el de la página: coincide con alguno de sus titulares o lo contiene. */
function matchesTitle(h: string, id: PageIdentity): boolean {
  if (h.length < 8) return false;
  return id.titles.some((t) => t.includes(h) || h.includes(t));
}

const URL_ATTRS = ['data-url', 'data-href', 'data-permalink', 'data-canonical', 'data-share-url', 'data-article-url', 'data-link', 'data-path', 'itemid'];

/** Rutas que el propio bloque declara como suyas (atributos, enlaces del titular, itemprop=url). */
function ownPaths(c: Element, url: string): Set<string> {
  const out = new Set<string>();
  const add = (h: string | null | undefined) => {
    const p = pathOf(h, url);
    if (p) out.add(p);
  };
  for (const el of [c, ...Array.from(c.querySelectorAll('[data-url], [data-href], [data-permalink], [data-canonical], [data-share-url], [data-article-url], [itemid]')).slice(0, 5)]) {
    for (const a of URL_ATTRS) add(el.getAttribute(a));
  }
  c.querySelectorAll('meta[itemprop="url"], link[itemprop="url"], link[rel="canonical"]').forEach((m) => add(m.getAttribute('content') ?? m.getAttribute('href')));
  c.querySelectorAll('h1 a[href], h2 a[href], h3 a[href]').forEach((a) => add(a.getAttribute('href')));
  return out;
}

function headingsOf(c: Element): string[] {
  return Array.from(c.querySelectorAll(HEADING))
    .map((h) => norm(textOf(h)))
    .filter((t) => t.length >= 8);
}

function paragraphChars(c: Element): number {
  let n = 0;
  c.querySelectorAll('p').forEach((p) => {
    n += textOf(p).length;
  });
  return n;
}

function candidatesOf(doc: Document): Element[] {
  if (!doc.body) return [];
  return Array.from(doc.body.querySelectorAll(ARTICLE_SELECTOR)).filter((el) => !el.parentElement?.closest(ARTICLE_SELECTOR) && paragraphChars(el) >= MIN_CANDIDATE_CHARS);
}

interface Scored {
  el: Element;
  score: number;
  /** Declara su propia URL, distinta de la de la página. */
  foreignUrl: boolean;
  /** Tiene un titular que no es el de la página. */
  foreignHeading: boolean;
}

function score(c: Element, id: PageIdentity, url: string, firstH1: Element | null): Scored {
  let s = 0;
  const paths = ownPaths(c, url);
  const mine = Array.from(paths).some((p) => id.paths.has(p));
  const foreignUrl = paths.size > 0 && !mine;
  if (mine) s += 4;
  const heads = headingsOf(c);
  const headMatch = heads.some((h) => matchesTitle(h, id));
  if (headMatch) s += 3;
  if (firstH1 && c.contains(firstH1)) s += 2;
  const foreignHeading = heads.length > 0 && !headMatch;
  return { el: c, score: s, foreignUrl, foreignHeading };
}

/**
 * Si la página trae varias noticias completas, deja solo la de esta URL. Devuelve cuántas quitó.
 * Sin ninguna señal que distinga la noticia actual no se toca nada (podría ser un artículo en varias partes).
 */
export function keepPrimaryArticle(doc: Document, url: string): number {
  const cands = candidatesOf(doc);
  if (cands.length < 2) return 0;
  const id = identityOf(doc, url);
  const firstH1 = doc.querySelector('h1');
  const scored = cands.map((c) => score(c, id, url, firstH1));
  // El primero en orden de documento gana los empates: la noticia actual va antes que las precargadas.
  const winner = scored.reduce((best, s) => (s.score > best.score ? s : best));
  let removed = 0;
  for (const s of scored) {
    if (s === winner) continue;
    const other = winner.score > 0 ? s.foreignHeading || s.foreignUrl : s.foreignUrl && s.foreignHeading;
    if (!other || s.el.contains(winner.el) || winner.el.contains(s.el)) continue;
    s.el.remove();
    removed++;
  }
  return removed;
}

/**
 * Tokens de clase/id de módulos que no son la noticia: la siguiente precargada, recomendadas, más leídas,
 * scroll infinito, "lee también" como bloque con tarjetas completas.
 */
const MODULE_TOKEN = /(?:^|[\s_-])(?:related|relacionad[oa]s?|recomendad[oa]s?|recommend(?:ed|ations?)?|most-?read|mas-?leid[oa]s?|more-?(?:news|stories)|mas-?noticias|next-?(?:article|story|post|news)|siguiente-?(?:noticia|articulo)|read-?next|infinite(?:-?scroll)?|endless|taboola|outbrain)(?:[\s_-]|$)/i;

/**
 * Quita los módulos de "siguiente/relacionadas/recomendadas/más leídas" que no contienen la noticia.
 * Nunca toca un bloque que contiene el titular de la página o que lleva la mayor parte del texto corrido.
 */
export function dropFollowModules(doc: Document): number {
  if (!doc.body) return 0;
  const total = paragraphChars(doc.body) || 1;
  const firstH1 = doc.querySelector('h1');
  let removed = 0;
  for (const el of Array.from(doc.body.querySelectorAll('[class], [id], [data-module], [data-component], [data-testid]'))) {
    if (!el.isConnected || el === doc.body || el.tagName === 'ARTICLE' || el.tagName === 'MAIN') continue;
    const tokens = [el.getAttribute('class'), el.getAttribute('id'), el.getAttribute('data-module'), el.getAttribute('data-component'), el.getAttribute('data-testid')].filter(Boolean).join(' ');
    if (!MODULE_TOKEN.test(tokens)) continue;
    if (firstH1 && el.contains(firstH1)) continue;
    const chars = paragraphChars(el);
    // Solo módulos con texto corrido de otras noticias; las listas de enlaces las descarta Readability.
    if (chars < 160 || chars / total > 0.5) continue;
    el.remove();
    removed++;
  }
  return removed;
}

const CUT_MIN_BEFORE = 600;
const CUT_MIN_AFTER = 150;
const CUT_MIN_HEADING = 25;

/**
 * Antes de Readability (que convierte los h1 del cuerpo en h2): si tras un tramo largo de texto aparece otro
 * `h1` que no es el titular de la página, es la cabecera de la noticia siguiente; se quita desde ahí.
 * Devuelve `true` si cortó.
 */
export function cutAtNextStory(doc: Document, url: string): boolean {
  if (!doc.body) return false;
  const id = identityOf(doc, url);
  if (!id.titles.length) return false;
  for (const h of Array.from(doc.body.querySelectorAll('h1'))) {
    const t = norm(textOf(h));
    if (t.length < CUT_MIN_HEADING || matchesTitle(t, id)) continue;
    const range = doc.createRange();
    range.selectNodeContents(doc.body);
    range.setEndBefore(h);
    const before = doc.createElement('div');
    before.appendChild(range.cloneContents());
    if (paragraphChars(before) < CUT_MIN_BEFORE) continue;
    if (paragraphChars(doc.body) - paragraphChars(before) < CUT_MIN_AFTER) continue;
    let node: Element | null = h;
    while (node && node !== doc.body) {
      while (node.nextSibling) node.nextSibling.remove();
      node = node.parentElement;
    }
    h.remove();
    return true;
  }
  return false;
}
