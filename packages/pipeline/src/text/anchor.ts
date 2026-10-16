/**
 * Anclaje de citas en el texto del artículo. Regla de oro: los desplazamientos (offsets) que devuelve un modelo
 * no sirven (cuentan caracteres distinto, sobre otro texto o directamente se los inventan): la posición sale
 * SIEMPRE de buscar la cita en el texto. Si no se encuentra con seguridad, la marca se descarta; es mejor no
 * subrayar que subrayar otra cosa.
 */
export type Span = [number, number];
export interface Located { span: Span; how: 'exact' | 'folded' | 'ellipsis' | 'fuzzy'; score: number }

const stripMarks = (ch: string): string => {
  const d = ch.normalize('NFD');
  return d.length > 1 && /\p{L}/u.test(d[0]!) ? d[0]! : ch;
};

/** Equivalencia carácter a carácter (misma longitud): mayúsculas, acentos, comillas, guiones y espacios raros. */
export const fold = (ch: string): string => {
  if (/\s/.test(ch)) return ' ';
  if (/[‘’‚‛′´`]/.test(ch)) return "'";
  if (/[“”„‟«»″]/.test(ch)) return '"';
  if (/[‐-―−]/.test(ch)) return '-';
  if (ch === '…') return '.';
  return stripMarks(ch).toLowerCase();
};

/** Texto plegado (espacios colapsados) con el índice original de cada carácter. */
export function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = '';
  const map: number[] = [];
  let prevSpace = false;
  for (let i = 0; i < text.length; i++) {
    const f = fold(text[i]!);
    if (f === ' ') {
      if (prevSpace || folded === '') continue;
      prevSpace = true;
    } else prevSpace = false;
    folded += f;
    map.push(i);
  }
  return { folded, map };
}

const foldPlain = (s: string): string => foldWithMap(s).folded.trim();

/** Variantes de una cita tal como la devuelven los modelos: entre comillas o con traducción entre corchetes añadida. */
export function quoteVariants(raw: string): string[] {
  const out: string[] = [];
  const add = (s: string) => {
    const t = s.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  add(raw);
  let q = raw.trim();
  q = q.replace(/^[«"“„'‘]+\s*/, '').replace(/\s*[»"”'’]+$/, '');
  add(q);
  const noTranslation = q.replace(/\s*\[[^\]]{3,}\]\s*$/, '');
  add(noTranslation);
  add(noTranslation.replace(/^(\.{3}|…)\s*/, '').replace(/\s*(\.{3}|…)$/, ''));
  return out;
}

const ABBR = new Set(['sr', 'sra', 'srta', 'dr', 'dra', 'd', 'dña', 'ud', 'uds', 'vd', 'vds', 'etc', 'pág', 'págs', 'núm', 'nº', 'vs', 'av', 'avda', 'gral', 'cap', 'art', 'mr', 'mrs', 'ms', 'jr', 'st', 'inc', 'ltd', 'co', 'fig', 'tel', 'aprox', 'ej', 'cía', 'excmo', 'ilmo', 'mons', 'prof', 'lic', 'ing', 'no', 'dpto']);

/** ¿La palabra que termina en el punto es una abreviatura (F., EE., Sr., etc.)? */
function isAbbreviation(before: string): boolean {
  const m = /([\p{L}\p{N}.ºª]+)$/u.exec(before);
  if (!m) return false;
  const w = m[1]!.replace(/\.$/, '');
  if (/^\p{Lu}$/u.test(w)) return true; // inicial: «F.», «J.»
  if (/^(\p{Lu}{1,2}\.)+\p{Lu}{1,2}$/u.test(w)) return true; // EE.UU, S.A
  if (/^\p{Lu}{2}$/u.test(w) && before.endsWith('.')) return true; // «EE.» «UU.»
  return ABBR.has(w.toLowerCase());
}

const OPENERS = /^[\p{Lu}\p{N}¿¡«"“'‘(\[—-]/u;

/** Frases [start, end) del texto: por párrafo y sin cortar en abreviaturas, iniciales ni decimales. */
export function sentenceSpans(text: string): Span[] {
  const out: Span[] = [];
  const push = (a: number, b: number) => {
    while (a < b && /\s/.test(text[a]!)) a++;
    while (b > a && /\s/.test(text[b - 1]!)) b--;
    if (b > a) out.push([a, b]);
  };
  let para = 0;
  const paraEnds = [...text.matchAll(/\n+/g)].map((m) => [m.index!, m.index! + m[0].length] as const);
  const bounds: Span[] = [];
  for (const [s, e] of paraEnds) {
    bounds.push([para, s]);
    para = e;
  }
  bounds.push([para, text.length]);
  for (const [ps, pe] of bounds) {
    let start = ps;
    const re = /[.!?…]+["”»')\]]*(?=\s|$)/g;
    const seg = text.slice(ps, pe);
    for (let m = re.exec(seg); m; m = re.exec(seg)) {
      const end = ps + m.index + m[0].length;
      const before = text.slice(start, ps + m.index + 1);
      const rest = text.slice(end, pe).trimStart();
      if (rest && !OPENERS.test(rest)) continue;
      if (m[0][0] === '.' && isAbbreviation(before)) continue;
      push(start, end);
      start = end;
    }
    push(start, pe);
  }
  return out;
}

const wordsOf = (s: string): string[] => foldPlain(s).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);

/** Similitud de Dice entre los conjuntos de palabras (0..1). */
export function similarity(a: string, b: string): number {
  const A = new Set(wordsOf(a));
  const B = new Set(wordsOf(b));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit++;
  return (2 * hit) / (A.size + B.size);
}

function nearest(positions: number[], hint?: Span): number {
  if (!hint || hint[1] <= hint[0]) return positions[0]!;
  return positions.reduce((best, p) => (Math.abs(p - hint[0]) < Math.abs(best - hint[0]) ? p : best), positions[0]!);
}

function allIndexes(hay: string, needle: string): number[] {
  const out: number[] = [];
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) out.push(i);
  return out;
}

const MIN_FUZZY = 0.85;
const MIN_FUZZY_WORDS = 4;

/** Dónde está la cita en el texto. `null` si no se puede asegurar. `hint` solo desempata entre repeticiones exactas. */
export function locate(text: string, rawQuote: string, hint?: Span, opts: { fuzzy?: boolean } = {}): Located | null {
  const variants = quoteVariants(rawQuote);
  if (!variants.length) return null;
  for (const q of variants) {
    const at = allIndexes(text, q);
    if (at.length) {
      const a = nearest(at, hint);
      return { span: [a, a + q.length], how: 'exact', score: 1 };
    }
  }
  const { folded, map } = foldWithMap(text);
  for (const q of variants) {
    const fq = foldPlain(q);
    if (fq.length < 8) continue;
    const at = allIndexes(folded, fq);
    if (at.length) {
      const i = hint ? at.reduce((best, p) => (Math.abs(map[p]! - hint[0]) < Math.abs(map[best]! - hint[0]) ? p : best), at[0]!) : at[0]!;
      return { span: [map[i]!, map[i + fq.length - 1]! + 1], how: 'folded', score: 1 };
    }
  }
  // «inicio … fin»: se localizan los dos extremos (en orden) y la cita es todo lo que hay entre ellos.
  for (const q of variants) {
    const parts = q.split(/\s*(?:\.{3}|…)\s*/).map(foldPlain).filter((p) => p.length >= 10);
    if (parts.length < 2) continue;
    const first = folded.indexOf(parts[0]!);
    if (first < 0) continue;
    const lastPart = parts[parts.length - 1]!;
    const last = folded.indexOf(lastPart, first + parts[0]!.length);
    if (last < 0) continue;
    const a = map[first]!;
    const b = map[last + lastPart.length - 1]! + 1;
    if (b - a <= Math.max(400, rawQuote.length * 3)) return { span: [a, b], how: 'ellipsis', score: 1 };
  }
  if (opts.fuzzy === false) return null;
  // Último recurso: la frase casi idéntica (el modelo cambió una palabra). Exige parecido alto, no «alguna palabra en común».
  const q = variants[variants.length > 2 ? 2 : variants.length - 1]!;
  if (wordsOf(q).length < MIN_FUZZY_WORDS) return null;
  let best: Located | null = null;
  for (const [a, b] of sentenceSpans(text)) {
    const score = similarity(q, text.slice(a, b));
    if (score >= MIN_FUZZY && (!best || score > best.score)) best = { span: [a, b], how: 'fuzzy', score };
  }
  return best;
}

const isWordChar = (ch: string | undefined): boolean => !!ch && /[\p{L}\p{N}]/u.test(ch);

/** ¿El tramo empieza y acaba en límite de palabra? */
export function onWordBoundaries(text: string, [a, b]: Span): boolean {
  return !(isWordChar(text[a - 1]) && isWordChar(text[a])) && !(isWordChar(text[b - 1]) && isWordChar(text[b]));
}

export const countWords = (s: string): number => (s.trim().match(/\S+/g) ?? []).length;

/** Quita solapes y anidados: gana el primero de la lista (el que el modelo puso como más importante). Devuelve por posición. */
export function dropOverlaps<T extends { span: Span }>(items: T[], taken: Span[] = []): T[] {
  const kept: T[] = [];
  const spans: Span[] = [...taken];
  for (const it of items) {
    if (spans.some(([a, b]) => it.span[0] < b && it.span[1] > a)) continue;
    kept.push(it);
    spans.push(it.span);
  }
  return kept.sort((x, y) => x.span[0] - y.span[0]);
}

/** Tope de texto marcado (fracción del artículo): entra por orden de prioridad hasta llenarlo. */
export function capCoverage<T extends { span: Span }>(items: T[], textLength: number, maxFraction: number): T[] {
  const budget = Math.floor(textLength * maxFraction);
  let used = 0;
  const kept: T[] = [];
  for (const it of items) {
    const len = it.span[1] - it.span[0];
    // La primera (la más importante) siempre entra: en un texto corto el tope no puede dejarlo sin marca alguna.
    if (kept.length && used + len > budget) continue;
    used += len;
    kept.push(it);
  }
  return kept;
}
