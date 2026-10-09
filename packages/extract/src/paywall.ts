/**
 * Limpieza del texto cuando la página lo limita por suscripción.
 *
 * Solo QUITA llamadas a suscribirse/iniciar sesión y avisa de que el artículo está limitado.
 * No intenta recuperar texto oculto: lo que la página no muestra, el lector tampoco.
 */

const strip = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Frases imperativas de muro de suscripción (es, en, de), sin acentos y en minúsculas. */
const STRONG: RegExp[] = [
  /suscribete/, /suscribirme/, /suscribirse/, /para seguir leyendo/, /seguir leyendo/, /continuar leyendo/,
  /lee sin limites?/, /lectura ilimitada/, /inicia(?:r)? sesion/, /ya eres (?:suscriptor|usuario)/, /registrate/,
  /te quedan \d+ (?:articulos|noticias)/, /hazte (?:socio|premium)/,
  /subscribe/, /to (?:keep|continue) reading/, /continue reading/, /sign in to (?:read|continue)/,
  /log ?in to (?:read|continue)/, /already a (?:subscriber|member)/, /unlimited access/, /register to (?:read|continue)/,
  /become a member/, /unlock this article/, /read the full (?:story|article)/, /free articles? (?:left|remaining)/,
  /abonnieren/, /weiterlesen mit/, /jetzt weiterlesen/, /zum weiterlesen/, /anmelden um/, /bereits abonnent/,
  /unbegrenzt lesen/,
];
/** Palabras sueltas del mundo de las suscripciones: solo cuentan en textos muy cortos. */
const WEAK: RegExp[] = [
  /suscripcion/, /suscriptor/, /articulos? gratuitos?/, /contenido (?:exclusivo|para suscriptores)/,
  /subscribers?/, /subscription/, /\d+ free articles?/, /abonnent/, /abo/, /kostenlose artikel/, /registrieren/,
];

const CTA_MAX_CHARS = 170;
const CTA_MAX_WORDS = 28;
const WEAK_MAX_WORDS = 8;

export function isCtaText(text: string): boolean {
  const t = strip(text);
  if (!t || t.length > CTA_MAX_CHARS) return false;
  const words = t.split(' ').length;
  if (words <= CTA_MAX_WORDS && STRONG.some((re) => re.test(t))) return true;
  return words <= WEAK_MAX_WORDS && WEAK.some((re) => re.test(t));
}

/** Marcadores de muro en atributos habituales (no en texto). */
const WALL_SELECTOR = [
  '[class*="paywall" i]', '[id*="paywall" i]', '[data-paywall]', '[class*="subscribe-wall" i]',
  '[class*="subscription-wall" i]', '[class*="regwall" i]', '[class*="metered" i]', '[class*="premium-lock" i]',
  '[class*="subscriber-only" i]',
].join(',');

/** Bloques de llamada a la acción: solo se tocan si son cortos (nunca el contenedor del artículo). */
const BLOCK_TAGS = new Set(['P', 'DIV', 'SECTION', 'ASIDE', 'SPAN', 'A', 'BUTTON', 'H2', 'H3', 'H4', 'H5', 'LI', 'UL', 'FORM', 'FOOTER', 'STRONG', 'B', 'EM']);

const textOf = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

/** `true` si algún elemento del documento declara un muro (clase/id/atributo, JSON-LD o metadatos). */
export function hasWallMarker(doc: Document): boolean {
  if (doc.querySelector(WALL_SELECTOR)) return true;
  const tier = doc.querySelector('meta[property="article:content_tier"], meta[name="article:content_tier"], meta[name="content_tier"]');
  if (tier && /locked|metered|premium|subscriber/i.test(tier.getAttribute('content') ?? '')) return true;
  for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    if (/"isAccessibleForFree"\s*:\s*(?:false|"false"|"False")/.test(s.textContent ?? '')) return true;
  }
  return false;
}

/**
 * Quita de `root` los bloques cortos que son llamadas a suscribirse o iniciar sesión, por texto o por
 * atributos de muro. Devuelve cuántos quitó. Nunca elimina un elemento con mucho texto corrido.
 */
export function stripPaywallBlocks(root: ParentNode, opts: { byAttributes?: boolean } = {}): number {
  let removed = 0;
  if (opts.byAttributes) {
    root.querySelectorAll(WALL_SELECTOR).forEach((el) => {
      if (textOf(el).length <= 400) {
        el.remove();
        removed++;
      }
    });
  }
  // De dentro afuera: un bloque cuyo texto entero es una llamada a la acción.
  const all = Array.from(root.querySelectorAll('*')).reverse();
  for (const el of all) {
    if (!el.isConnected && !root.contains(el)) continue;
    if (!BLOCK_TAGS.has(el.tagName)) continue;
    if (el.querySelector('p, h1, h2, ul, ol, blockquote, figure, img')) {
      // contenedor con estructura: solo se considera si es pequeño (una tarjeta de suscripción)
      if (textOf(el).length > CTA_MAX_CHARS || el.querySelectorAll('p').length > 3) continue;
    }
    if (isCtaText(textOf(el))) {
      el.remove();
      removed++;
    }
  }
  return removed;
}

const TERMINAL = /[.!?…:;)\]"'”’»]\s*$/;

/** El texto acaba "en seco": sin puntuación final (típico de un teaser recortado). */
export function endsAbruptly(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && !TERMINAL.test(t);
}

const norm = (s: string): string => strip(s).replace(/[^\p{L}\p{N} ]/gu, '').trim();

/**
 * Quita párrafos repetidos o contenidos en otro más largo (texto duplicado en el DOM).
 * Devuelve cuántos quitó.
 */
export function dedupeParagraphs(root: ParentNode): number {
  const nodes = Array.from(root.querySelectorAll('p, li, blockquote'));
  const texts = nodes.map((n) => norm(textOf(n)));
  let removed = 0;
  nodes.forEach((n, i) => {
    const t = texts[i] ?? '';
    if (t.length < 30) return;
    for (let j = 0; j < nodes.length; j++) {
      if (j === i || !nodes[j]!.isConnected) continue;
      const o = texts[j] ?? '';
      // idéntico (se queda el primero) o contenido en uno más largo
      if ((o === t && j < i) || (o.length > t.length + 10 && o.includes(t))) {
        n.remove();
        removed++;
        return;
      }
    }
  });
  return removed;
}

const WALL_MARK = 'Subscribe to continue reading';

/**
 * Antes de Readability: los elementos de muro declarados por atributos (que Readability descartaría sin
 * dejar rastro) se sustituyen por una marca de texto, para saber dónde cortó la página.
 */
export function markWallElements(root: ParentNode): number {
  let n = 0;
  root.querySelectorAll(WALL_SELECTOR).forEach((el) => {
    if (!el.isConnected || textOf(el).length > 400) return;
    const p = el.ownerDocument.createElement('p');
    p.textContent = WALL_MARK;
    el.replaceWith(p);
    n++;
  });
  return n;
}

const lastTextBlockBefore = (root: Element, el: Element): Element | null => {
  const blocks = Array.from(root.querySelectorAll('p, li, blockquote'));
  let prev: Element | null = null;
  for (const b of blocks) {
    if (b === el || b.contains(el) || el.contains(b)) continue;
    if (el.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) break;
    if (textOf(b)) prev = b;
  }
  return prev;
};

export interface BodyClean {
  /** Se quitaron llamadas a suscribirse (había muro o aviso). */
  cta: number;
  /** El texto se cortó tras un párrafo recortado seguido de una llamada a suscribirse. */
  cut: boolean;
  dups: number;
}

/**
 * Limpia el cuerpo extraído: si una llamada a suscribirse sigue a un párrafo recortado, corta ahí
 * (lo posterior es lo que la página dejó tras el muro); quita el resto de llamadas y los párrafos duplicados.
 */
export function cleanBody(root: Element): BodyClean {
  let cut = false;
  const candidates = Array.from(root.querySelectorAll('p, div, section, aside, li, a, button, span, h2, h3, h4')).filter(
    (el) => isCtaText(textOf(el)) && !el.querySelector('p, li, h2, h3'),
  );
  const first = candidates[0];
  if (first) {
    const prev = lastTextBlockBefore(root, first);
    if (prev && endsAbruptly(textOf(prev)) && !isCtaText(textOf(prev))) {
      cut = true;
      let node: Element | null = first;
      while (node && node !== root) {
        while (node.nextSibling) node.nextSibling.remove();
        node = node.parentElement;
      }
    }
  }
  const cta = stripPaywallBlocks(root);
  const dups = dedupeParagraphs(root);
  return { cta, cut, dups };
}
