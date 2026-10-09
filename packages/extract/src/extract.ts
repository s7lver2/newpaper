import { Readability } from '@mozilla/readability';
import { LIMITS, type Article } from './article';
import { fixImages } from './images';
import { cleanBody, endsAbruptly, hasWallMarker, markWallElements } from './paywall';
import { dropHiddenFromClone } from './visibility';

const cut = (s: string | null | undefined, max: number): string | null => (s ? s.slice(0, max).trim() || null : null);

function publishedOf(doc: Document): string | null {
  const sel = ['meta[property="article:published_time"]', 'meta[name="date"]', 'meta[itemprop="datePublished"]', 'time[datetime]'];
  for (const s of sel) {
    const el = doc.querySelector(s);
    const v = el?.getAttribute('content') ?? el?.getAttribute('datetime');
    if (v) return v.trim();
  }
  return null;
}

function absolutize(html: string, base: string): string {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  tpl.content.querySelectorAll<HTMLElement>('[src],[href]').forEach((el) => {
    for (const attr of ['src', 'href']) {
      const v = el.getAttribute(attr);
      if (v === null) continue;
      try {
        el.setAttribute(attr, new URL(v, base).href);
      } catch {
        el.removeAttribute(attr);
      }
    }
  });
  tpl.content.querySelectorAll('script,style,noscript').forEach((n) => n.remove());
  return tpl.innerHTML;
}

/** Texto plano con una línea en blanco entre bloques (el `textContent` los pegaría). */
function plainText(el: Element): string {
  const copy = el.cloneNode(true) as Element;
  copy.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, figcaption, tr, br').forEach((n) => n.after('\n\n'));
  return (copy.textContent ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function extractArticle(doc: Document, url: string): Article | null {
  const clone = doc.cloneNode(true) as Document;
  // Solo se lee lo que la página muestra (nada oculto o recortado) y se marcan los muros.
  dropHiddenFromClone(doc, clone);
  const wallMarker = hasWallMarker(doc);
  markWallElements(clone);
  fixImages(clone);
  // Readability resuelve las URL relativas con baseURI: se fija a la URL real del artículo.
  if (!clone.querySelector('base[href]') && clone.head) {
    const base = clone.createElement('base');
    base.href = url;
    clone.head.prepend(base);
  }
  const parsed = new Readability(clone, { charThreshold: 300 }).parse();
  if (!parsed || !parsed.content) return null;
  const body = document.createElement('div');
  body.innerHTML = absolutize(parsed.content, url);
  const cleaned = cleanBody(body);
  const text = plainText(body);
  const walled = wallMarker || cleaned.cta > 0 || cleaned.cut;
  if (text.length < (walled ? 120 : 300)) return null;
  const blocks = body.querySelectorAll('p, li, blockquote');
  const last = blocks.length ? (blocks[blocks.length - 1]?.textContent ?? '') : text;
  const limited = cleaned.cut || (walled && (endsAbruptly(last) || text.length < 900));
  const html = body.innerHTML.slice(0, LIMITS.html);
  return {
    url,
    title: (parsed.title ?? doc.title ?? '').slice(0, LIMITS.title).trim(),
    byline: cut(parsed.byline, LIMITS.field),
    siteName: cut(parsed.siteName, LIMITS.field),
    published: cut(parsed.publishedTime ?? publishedOf(doc), LIMITS.field),
    lang: cut(parsed.lang ?? doc.documentElement.lang, 35),
    html,
    text: text.slice(0, LIMITS.text),
    excerpt: cut(parsed.excerpt, LIMITS.field),
    limited,
  };
}

export function extractFromHtml(html: string, url: string): Article | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return extractArticle(doc, url);
}
