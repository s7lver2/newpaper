import { describe, expect, it } from 'vitest';
import type { Visualization } from '../schemas/visualization';
import { validateVisualizations } from './synthesis';

const parl = (series: { partyId: string; seats: number }[], majority = 176): Visualization => ({
  type: 'parliament', title: 'Congreso', sourceIds: ['S1'], data: { chamber: 'congreso', total: 350, majority, series: [{ label: '2023', seats: series }] },
});

describe('validateVisualizations', () => {
  const src = new Set(['S1']);
  const parties = new Set(['GP', 'GS', 'GVOX']);
  it('drops charts without known sources and invalid hemicycles', () => {
    const ok = parl([{ partyId: 'GP', seats: 137 }, { partyId: 'GS', seats: 121 }]);
    const out = validateVisualizations([
      ok,
      { ...ok, sourceIds: ['S9'] },
      parl([{ partyId: 'GP', seats: 300 }, { partyId: 'GS', seats: 121 }]),
      parl([{ partyId: 'XX', seats: 10 }]),
      parl([{ partyId: 'GP', seats: 137 }], 170),
      { type: 'bar', title: 'B', sourceIds: ['S1', 'S9'], data: { points: [{ x: 'a', y: 1 }] } },
    ], src, parties);
    expect(out).toHaveLength(2);
    expect(out[1]!.sourceIds).toEqual(['S1']);
  });
});
