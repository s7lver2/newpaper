import { describe, expect, it } from 'vitest';
import { ScoreSchema, SynthesisSchema, VisualizationSchema } from './index';

const viz = (v: object) => VisualizationSchema.safeParse({ title: 'T', sourceIds: ['s1'], ...v });

describe('schemas', () => {
  it('accepts every visualization type and requires sources', () => {
    expect(viz({ type: 'bar', data: { points: [{ x: '2024', y: 1 }] } }).success).toBe(true);
    expect(viz({ type: 'range', data: { min: 0, max: 10, ranges: [{ label: 'a', from: 1, to: 2 }] } }).success).toBe(true);
    expect(viz({ type: 'stacked', data: { categories: ['a'], rows: [{ label: 'r', values: [1] }] } }).success).toBe(true);
    expect(viz({ type: 'matrix', data: { columns: ['c'], rows: [{ label: 'r', cells: ['si'] }] } }).success).toBe(true);
    expect(viz({ type: 'table', data: { columns: ['c'], rows: [['x', 1]] } }).success).toBe(true);
    expect(viz({ type: 'map', data: { regions: [{ code: 'ES-MD', value: 3 }] } }).success).toBe(true);
    expect(viz({ type: 'parliament', data: { chamber: 'congreso', total: 350, majority: 176, series: [{ label: '2023', seats: [{ partyId: 'GP', seats: 137 }, { partyId: 'GS', seats: 121 }] }] } }).success).toBe(true);
    expect(VisualizationSchema.safeParse({ type: 'bar', title: 'T', sourceIds: [], data: { points: [] } }).success).toBe(false);
  });

  it('allows a null framing only as not determinable', () => {
    const base = { neutrality: 50, confidence: 0.2, interval: null, signals: [], voices: { actors: [], lastWord: null }, omissions: [] };
    expect(ScoreSchema.safeParse({ ...base, framing: null, verdict: 'no_determinable' }).success).toBe(true);
    expect(ScoreSchema.safeParse({ ...base, framing: null, verdict: 'neutral' }).success).toBe(false);
  });

  it('requires exactly three summary lines', () => {
    const s = { headline: 'h', summary3: ['a', 'b'], facts: [], parties: [], disputes: [], unknowns: [], visualizations: [], rewrites: [] };
    expect(SynthesisSchema.safeParse(s).success).toBe(false);
    expect(SynthesisSchema.safeParse({ ...s, summary3: ['a', 'b', 'c'] }).success).toBe(true);
  });
});
