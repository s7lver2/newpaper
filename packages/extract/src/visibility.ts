/**
 * El lector solo debe mostrar lo que la página muestra. Readability trabaja sobre una copia sin estilos,
 * así que aquí se recorren en paralelo el documento vivo y su copia y se quita de la copia todo lo que el
 * navegador tiene oculto o recortado (display:none, cajas colapsadas, texto fuera de un contenedor con
 * recorte, p. ej. el resto de un artículo tras un muro).
 */

const TEXT_BLOCKS = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'FIGURE', 'PRE', 'TABLE']);

function hasLayout(doc: Document): boolean {
  const view = doc.defaultView;
  if (!view || typeof view.getComputedStyle !== 'function') return false;
  return doc.documentElement.getBoundingClientRect().height > 0;
}

function clipper(el: Element, cache: WeakMap<Element, Element | null>): Element | null {
  const view = el.ownerDocument.defaultView!;
  let node: Element | null = el.parentElement;
  const chain: Element[] = [];
  let found: Element | null = null;
  while (node && node !== el.ownerDocument.documentElement) {
    if (cache.has(node)) {
      found = cache.get(node) ?? null;
      break;
    }
    chain.push(node);
    const st = view.getComputedStyle(node);
    const clips = /hidden|clip/.test(st.overflowY) && node.scrollHeight > node.clientHeight + 24 && node.clientHeight > 0;
    if (clips) {
      found = node;
      break;
    }
    node = node.parentElement;
  }
  chain.forEach((n) => cache.set(n, found));
  return found;
}

function isHidden(el: Element, layout: boolean, cache: WeakMap<Element, Element | null>): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  const st = view.getComputedStyle(el);
  if (st.display === 'none') return true;
  if (!layout) return false;
  if (st.visibility === 'hidden' || st.visibility === 'collapse') return true;
  if (!TEXT_BLOCKS.has(el.tagName)) return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return !!(el.textContent ?? '').trim();
  const c = clipper(el, cache);
  if (c && r.top >= c.getBoundingClientRect().bottom - 1) return true;
  return false;
}

/** Quita de `clone` lo que `live` no muestra. Devuelve cuántos elementos quitó. */
export function dropHiddenFromClone(live: Document, clone: Document): number {
  if (!live.body || !clone.body) return 0;
  const layout = hasLayout(live);
  const cache = new WeakMap<Element, Element | null>();
  let removed = 0;
  const walk = (a: Element, b: Element): void => {
    const ac = Array.from(a.children);
    const bc = Array.from(b.children);
    if (ac.length !== bc.length) return;
    for (let i = 0; i < ac.length; i++) {
      const a1 = ac[i]!;
      const b1 = bc[i]!;
      const tag = a1.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEMPLATE') continue;
      if (isHidden(a1, layout, cache)) {
        b1.remove();
        removed++;
      } else {
        walk(a1, b1);
      }
    }
  };
  walk(live.body, clone.body);
  return removed;
}
