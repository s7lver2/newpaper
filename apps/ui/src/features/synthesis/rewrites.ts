export type RewritePart = { kind: 'eq'; text: string } | { kind: 'change'; from: string; to: string; reason: string };

export function applyRewrites(text: string, rewrites: { from: string; to: string; reason: string }[]): RewritePart[] {
  const hits = rewrites
    .map((r) => ({ r, at: text.indexOf(r.from) }))
    .filter((h) => h.at >= 0)
    .sort((a, b) => a.at - b.at);
  const out: RewritePart[] = [];
  let i = 0;
  for (const { r, at } of hits) {
    if (at < i) continue; // solapa con un cambio anterior
    if (at > i) out.push({ kind: 'eq', text: text.slice(i, at) });
    out.push({ kind: 'change', from: r.from, to: r.to, reason: r.reason });
    i = at + r.from.length;
  }
  if (i < text.length) out.push({ kind: 'eq', text: text.slice(i) });
  return out;
}
