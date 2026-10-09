import type { AnalysisResult } from '@newpaper/pipeline';
import type { LensMark } from '@newpaper/ui-kit';

export function marksOf(r: AnalysisResult): LensMark[] {
  const status = new Map((r.verdicts ?? []).map((v) => [v.claimId, v.status]));
  const claims = (r.claims?.claims ?? []).map((c) => ({ id: c.id, start: c.span[0], end: c.span[1], kind: status.get(c.id) ?? 'pendiente', priority: 2 }));
  const loaded = (r.claims?.loadedPhrases ?? []).map((l, i) => ({ id: `l${i + 1}`, start: l.span[0], end: l.span[1], kind: 'cargada', priority: 1 }));
  return [...claims, ...loaded];
}
