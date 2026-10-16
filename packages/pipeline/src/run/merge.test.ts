import { describe, expect, it } from 'vitest';
import { mergeResults } from './merge';
import type { AnalysisResult } from './pipeline';
import type { Score } from '../schemas/score';

const score = (neutrality: number, verdict: Score['verdict'] = 'sesgo_leve'): Score => ({
  neutrality, framing: verdict === 'no_determinable' ? null : 50, confidence: 0.5, interval: verdict === 'no_determinable' ? null : [40, 60], signals: [], voices: { actors: [], lastWord: null }, omissions: [], verdict,
});
const base = (o: Partial<AnalysisResult>): AnalysisResult => ({ url: 'https://x.example/a', hash: 'h', quick: false, claims: null, coverage: null, verdicts: null, sources: [], score: null, synthesis: null, aiAuthorship: null, uncovered: false, failed: [], capped: false, ...o });
const phrase = { quote: 'punto de no retorno', span: [0, 19] as [number, number], reason: 'Hipérbole' };

describe('mergeResults', () => {
  it('returns whichever exists', () => {
    const q = base({ quick: true });
    expect(mergeResults(q, null)).toBe(q);
    expect(mergeResults(null, q)).toBe(q);
    expect(mergeResults(null, null)).toBeNull();
  });
  it('keeps the quick neutrality (marked) when the full run failed to score', () => {
    const quick = base({ quick: true, score: score(72), claims: { claims: [], loadedPhrases: [phrase] } });
    const full = base({ claims: { claims: [], loadedPhrases: [] }, failed: ['score', 'verify'], errors: { score: 'HTTP 400' } });
    const m = mergeResults(quick, full)!;
    expect(m.score?.neutrality).toBe(72);
    expect(m.scoreFromQuick).toBe(true);
    expect(m.claims?.loadedPhrases).toEqual([phrase]);
    expect(m.failed).toEqual(['score', 'verify']);
    expect(m.quick).toBe(false);
  });
  it('the full score replaces the quick one, including a not-determinable verdict', () => {
    const quick = base({ quick: true, score: score(90, 'neutral') });
    const full = base({ score: score(100, 'no_determinable') });
    const m = mergeResults(quick, full)!;
    expect(m.score?.verdict).toBe('no_determinable');
    expect(m.scoreFromQuick).toBeUndefined();
  });
});
