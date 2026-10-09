import { describe, expect, it } from 'vitest';
import { assignSeats, coalitionSeats, hemicycleLayout, majorityOf, type PartySeats } from './hemicycle';

const party = (partyId: string, order: number, seats: number): PartySeats => ({ partyId, name: partyId, short: partyId, color: '#000', order, seats });

describe('hemicycleLayout', () => {
  it.each([7, 350, 630, 650])('places exactly %i seats inside the upper half disc, left to right', (total) => {
    const seats = hemicycleLayout(total);
    expect(seats).toHaveLength(total);
    for (const s of seats) {
      expect(s.y).toBeGreaterThanOrEqual(-1e-9);
      expect(Math.hypot(s.x, s.y)).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(seats[0]!.x).toBeLessThan(0);
    expect(seats.at(-1)!.x).toBeGreaterThan(0);
    for (let i = 1; i < seats.length; i++) expect(seats[i]!.angle).toBeLessThanOrEqual(seats[i - 1]!.angle + 1e-12);
  });
});

describe('assignSeats', () => {
  it('fills seats by ideological order and leaves vacancies', () => {
    const layout = hemicycleLayout(350);
    const parties = [party('PP', 6, 137), party('PSOE', 3, 121), party('SUMAR', 1, 31)];
    const filled = assignSeats(layout, parties);
    expect(filled[0]!.partyId).toBe('SUMAR');
    expect(filled.filter((p) => p?.partyId === 'PSOE')).toHaveLength(121);
    expect(filled.filter((p) => p === null)).toHaveLength(350 - 289);
    expect(filled.findLastIndex((p) => p?.partyId === 'PSOE')).toBeLessThan(filled.findIndex((p) => p?.partyId === 'PP'));
  });
});

describe('majority builder', () => {
  it('adds the seats of the parties voting yes and compares with an absolute majority', () => {
    const parties = [party('PP', 6, 137), party('PSOE', 3, 121), party('SUMAR', 1, 31), party('VOX', 8, 33)];
    expect(majorityOf(350)).toBe(176);
    expect(majorityOf(630)).toBe(316);
    expect(coalitionSeats(parties, new Set(['PSOE', 'SUMAR']))).toBe(152);
    expect(coalitionSeats(parties, new Set(['PP', 'VOX']))).toBe(170);
    expect(coalitionSeats(parties, new Set(['PP', 'PSOE']))).toBeGreaterThanOrEqual(majorityOf(350));
    expect(coalitionSeats(parties, new Set(['NOEXISTE']))).toBe(0);
  });
});
