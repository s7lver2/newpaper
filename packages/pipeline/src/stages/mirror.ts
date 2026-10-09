/** §5.2.1.7 Prueba de espejo: intercambiar actores y términos de un bloque por los del otro. */
export function mirrorText(text: string, swaps: [string, string][]): string {
  let t = text;
  swaps.forEach(([a, b], i) => {
    t = t.replace(new RegExp(`\\b${a}\\b`, 'g'), `\u0000${i}A\u0000`).replace(new RegExp(`\\b${b}\\b`, 'g'), `\u0000${i}B\u0000`);
  });
  swaps.forEach(([a, b], i) => {
    t = t.replaceAll(`\u0000${i}A\u0000`, b).replaceAll(`\u0000${i}B\u0000`, a);
  });
  return t;
}

export async function mirrorCheck(score: (t: string) => Promise<number | null>, text: string, swaps: [string, string][], tolerance = 8) {
  const a = await score(text);
  const b = await score(mirrorText(text, swaps));
  const symmetric = a !== null && b !== null && Math.abs(a - 50 + (b - 50)) <= tolerance;
  return { a, b, symmetric };
}

/** Error medio absoluto por bloque en un conjunto ciego etiquetado por personas; `bias` = diferencia entre bloques. */
export async function blocError(items: { text: string; humanFraming: number; bloc: 'left' | 'right' }[], score: (t: string) => Promise<number | null>) {
  const err = { left: [] as number[], right: [] as number[] };
  for (const it of items) {
    const s = await score(it.text);
    if (s !== null) err[it.bloc].push(Math.abs(s - it.humanFraming));
  }
  const m = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const left = m(err.left);
  const right = m(err.right);
  return { left, right, bias: Math.abs(left - right) };
}
