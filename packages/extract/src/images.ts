/** Imágenes del artículo: elige la mejor URL real entre `src`, `srcset`, `<picture>` y atributos de carga diferida. */

const LAZY_ATTRS = ['data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'data-url', 'data-hi-res-src'];
const SRCSET_ATTRS = ['srcset', 'data-srcset', 'data-lazy-srcset'];
/** Anchura máxima que se pide: de sobra para una columna de lectura incluso en pantallas densas. */
const MAX_WIDTH = 1600;

const PLACEHOLDER = /(?:^|[/_.-])(?:placeholder|spacer|blank|transparent|pixel|1x1|loader|lazy)[\w.-]*\.(?:gif|png|svg|jpe?g|webp)(?:$|[?#])/i;

/** `true` si la URL no es una imagen real (vacía, `data:` o un marcador de posición típico). */
export function isPlaceholderSrc(src: string | null | undefined): boolean {
  const s = (src ?? '').trim();
  return !s || s.startsWith('data:') || PLACEHOLDER.test(s);
}

export interface SrcCandidate {
  url: string;
  /** Anchura en píxeles (`w`) o densidad × 400 (`x`); 0 si no hay descriptor. */
  width: number;
}

export function parseSrcset(value: string): SrcCandidate[] {
  const out: SrcCandidate[] = [];
  const re = /(\S+)(?:\s+(\d+(?:\.\d+)?)([wx]))?\s*(?:,\s*|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value.trim())) !== null) {
    if (m[0] === '') break;
    const url = (m[1] ?? '').replace(/,+$/, '');
    if (!url) continue;
    const n = m[2] ? Number(m[2]) : 0;
    out.push({ url, width: m[3] === 'x' ? n * 400 : n });
  }
  return out;
}

/** La mayor candidata que no pase de `MAX_WIDTH`; si todas pasan, la más pequeña de ellas. */
export function bestCandidate(cands: SrcCandidate[]): string | null {
  const real = cands.filter((c) => !isPlaceholderSrc(c.url));
  if (!real.length) return null;
  const withWidth = real.filter((c) => c.width > 0);
  if (!withWidth.length) return real[real.length - 1]!.url;
  const fitting = withWidth.filter((c) => c.width <= MAX_WIDTH).sort((a, b) => b.width - a.width);
  if (fitting.length) return fitting[0]!.url;
  return withWidth.sort((a, b) => a.width - b.width)[0]!.url;
}

function candidatesOf(img: Element): SrcCandidate[] {
  const holders: Element[] = [img];
  const parent = img.parentElement;
  if (parent && parent.tagName === 'PICTURE') holders.push(...Array.from(parent.querySelectorAll('source')));
  const out: SrcCandidate[] = [];
  for (const h of holders) {
    for (const a of SRCSET_ATTRS) {
      const v = h.getAttribute(a);
      if (v) out.push(...parseSrcset(v));
    }
  }
  return out;
}

/** Deja en cada `<img>` una `src` real (la mejor del `srcset`, o la de carga diferida si `src` es un marcador). */
export function fixImages(root: ParentNode): void {
  root.querySelectorAll('img').forEach((img) => {
    const best = bestCandidate(candidatesOf(img));
    if (best) {
      img.setAttribute('src', best);
      return;
    }
    if (!isPlaceholderSrc(img.getAttribute('src'))) return;
    for (const a of LAZY_ATTRS) {
      const v = img.getAttribute(a);
      if (v && !isPlaceholderSrc(v)) {
        img.setAttribute('src', v.trim());
        return;
      }
    }
  });
}
