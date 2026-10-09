import type { Score, Signal, SignalKind } from '../schemas/score';

export type Side = 'left' | 'center' | 'right';
export interface JudgeOutput {
  signals: { kind: SignalKind; value: number; evidence: string[] }[];
  actors: { name: string; quotes: number; side: Side }[];
  lastWordSide: Side | null;
  omissions: { fact: string; favors: 'left' | 'right' | 'none'; foundIn: string }[];
}
export interface FramingWeights { lexicon: number; judge: number; voices: number; omissions: number; minConfidence?: number; maxIntervalWidth?: number }
export const DEFAULT_WEIGHTS: FramingWeights = { lexicon: 0.35, judge: 0.45, voices: 0.1, omissions: 0.1, minConfidence: 0.35, maxIntervalWidth: 40 };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** §5.2.1.5: sin cita literal, la señal no cuenta. Las omisiones deben estar en otro documento. */
export function validateEvidence(out: JudgeOutput, docA: string, others: Map<string, string>): JudgeOutput {
  const a = norm(docA);
  return {
    ...out,
    signals: out.signals
      .map((s) => ({ ...s, evidence: s.evidence.filter((e) => e.trim().length >= 3 && a.includes(norm(e))) }))
      .filter((s) => s.evidence.length > 0),
    omissions: out.omissions.filter((o) => {
      const doc = others.get(o.foundIn);
      return !!doc && norm(doc).includes(norm(o.fact).slice(0, 40));
    }),
  };
}

export function combineFraming(o: {
  judge: JudgeOutput | null;
  lexiconRel: { value: number; confidence: number; evidence: string[] } | null;
  groupCenter: number;
  loadedPhrases: number;
  weights: FramingWeights;
}): Score {
  const signals: Signal[] = [];
  const parts: { w: number; v: number; conf: number }[] = [];
  const j = o.judge;

  if (o.lexiconRel) {
    signals.push({ kind: 'lexico', value: clamp(o.lexiconRel.value, -1, 1), evidence: o.lexiconRel.evidence, source: 'lexicon' });
    parts.push({ w: o.weights.lexicon, v: o.lexiconRel.value, conf: o.lexiconRel.confidence });
  }
  if (j?.signals.length) {
    for (const s of j.signals) signals.push({ ...s, value: clamp(s.value, -1, 1), source: 'judge' });
    const ev = j.signals.reduce((n, s) => n + s.evidence.length, 0);
    parts.push({ w: o.weights.judge, v: mean(j.signals.map((s) => s.value)), conf: Math.min(1, ev / 6) });
  }
  const sideVal = (s: Side) => (s === 'left' ? -1 : s === 'right' ? 1 : 0);
  const totalQuotes = j?.actors.reduce((n, a) => n + a.quotes, 0) ?? 0;
  if (j && totalQuotes > 0) {
    const v = clamp(j.actors.reduce((n, a) => n + sideVal(a.side) * a.quotes, 0) / totalQuotes + (j.lastWordSide ? sideVal(j.lastWordSide) * 0.25 : 0), -1, 1);
    signals.push({ kind: 'voces', value: v, evidence: j.actors.filter((a) => a.quotes > 0).map((a) => `${a.name} (${a.quotes})`), source: 'computed' });
    parts.push({ w: o.weights.voices, v, conf: Math.min(1, totalQuotes / 4) });
  }
  if (j?.omissions.length) {
    // Omitir datos que favorecen a la izquierda empuja el texto a la derecha, y viceversa.
    const v = clamp(j.omissions.reduce((n, x) => n + (x.favors === 'left' ? 1 : x.favors === 'right' ? -1 : 0), 0) / j.omissions.length, -1, 1);
    signals.push({ kind: 'omision', value: v, evidence: j.omissions.map((x) => x.fact), source: 'computed' });
    parts.push({ w: o.weights.omissions, v, conf: Math.min(1, j.omissions.length / 3) });
  }

  const voices = { actors: (j?.actors ?? []).map((a) => ({ name: a.name, quotes: a.quotes })), lastWord: j?.actors.find((a) => j.lastWordSide && a.side === j.lastWordSide)?.name ?? null };
  const omissions = (j?.omissions ?? []).map((x) => x.fact);
  const totalW = parts.reduce((n, p) => n + p.w, 0);
  const rel = totalW ? parts.reduce((n, p) => n + p.w * p.v, 0) / totalW : 0;
  const spread = parts.length > 1 ? Math.sqrt(mean(parts.map((p) => (p.v - rel) ** 2))) : 0.5;
  const coverage = totalW / (o.weights.lexicon + o.weights.judge + o.weights.voices + o.weights.omissions);
  const evidence = totalW ? parts.reduce((n, p) => n + p.w * p.conf, 0) / totalW : 0;
  const confidence = clamp(0.45 * coverage + 0.35 * evidence + 0.2 * (1 - Math.min(1, spread)), 0, 1);
  // Semianchura del intervalo: con la fórmula original (8 + 40·(1−c) + 20·dispersión) una señal fuerte y
  // coherente ya superaba los 40 puntos de ancho; se ajusta a 6 + 25·(1−c) + 15·dispersión (ver erratas).
  const half = 6 + 25 * (1 - confidence) + 15 * Math.min(1, spread);
  const meanAbs = mean(signals.map((s) => Math.abs(s.value)));
  const neutrality = Math.round(clamp(100 - 60 * meanAbs - 4 * o.loadedPhrases, 0, 100));

  const notDeterminable = parts.length < 2 || confidence < (o.weights.minConfidence ?? 0.35) || half * 2 > (o.weights.maxIntervalWidth ?? 40);
  if (notDeterminable) return { neutrality, framing: null, confidence, interval: null, signals, voices, omissions, verdict: 'no_determinable' };

  const framing = Math.round(clamp(o.groupCenter + 50 * rel, 0, 100));
  const verdict = neutrality >= 75 ? 'neutral' : neutrality >= 55 ? 'sesgo_leve' : neutrality >= 35 ? 'sesgado' : 'muy_sesgado';
  return { neutrality, framing, confidence, interval: [Math.max(0, Math.round(framing - half)), Math.min(100, Math.round(framing + half))], signals, voices, omissions, verdict };
}
