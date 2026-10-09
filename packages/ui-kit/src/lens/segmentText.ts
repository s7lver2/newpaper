export interface LensMark { id: string; start: number; end: number; kind: string; priority?: number }
export interface Segment { start: number; end: number; text: string; marks: LensMark[] }

export function segmentText(text: string, marks: LensMark[], from = 0, to = text.length): Segment[] {
  const lo = Math.max(0, from);
  const hi = Math.min(text.length, to);
  const valid = marks
    .filter((m) => m.end > m.start && m.start < hi && m.end > lo)
    .map((m) => ({ mark: m, start: Math.max(m.start, lo), end: Math.min(m.end, hi) }));
  const cuts = new Set<number>([lo, hi]);
  for (const v of valid) {
    cuts.add(v.start);
    cuts.add(v.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (b <= a) continue;
    const ms = valid
      .filter((v) => v.start <= a && v.end >= b)
      .map((v) => v.mark)
      .sort((x, y) => (y.priority ?? 0) - (x.priority ?? 0));
    out.push({ start: a, end: b, text: text.slice(a, b), marks: ms });
  }
  return out;
}

export function paragraphRanges(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const sep = /\n{2,}/g;
  let last = 0;
  const push = (s: number, e: number) => {
    while (s < e && /\s/.test(text[s]!)) s++;
    while (e > s && /\s/.test(text[e - 1]!)) e--;
    if (e > s) out.push({ start: s, end: e });
  };
  for (let m = sep.exec(text); m; m = sep.exec(text)) {
    push(last, m.index);
    last = m.index + m[0].length;
  }
  push(last, text.length);
  return out;
}
