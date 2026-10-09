import { describe, expect, it } from 'vitest';
import { blocError, mirrorCheck, mirrorText } from './mirror';

const swaps: [string, string][] = [['patronal', 'sindicatos'], ['izquierda', 'derecha']];

describe('mirror test (§5.2.1.7)', () => {
  it('swaps terms of one bloc for the other in both directions', () => {
    expect(mirrorText('La patronal critica a los sindicatos de izquierda.', swaps)).toBe('La sindicatos critica a los patronal de derecha.');
  });

  it('detects a symmetric and an asymmetric scorer', async () => {
    const symmetric = async (t: string) => (t.includes('derecha') ? 70 : 30);
    expect((await mirrorCheck(symmetric, 'un texto de izquierda', swaps)).symmetric).toBe(true);
    const biased = async (t: string) => (t.includes('derecha') ? 60 : 30);
    expect((await mirrorCheck(biased, 'un texto de izquierda', swaps)).symmetric).toBe(false);
  });

  it('measures error per bloc on a labelled validation set', async () => {
    const items = [{ text: 'a', humanFraming: 30, bloc: 'left' as const }, { text: 'b', humanFraming: 70, bloc: 'right' as const }];
    const r = await blocError(items, async (t) => (t === 'a' ? 40 : 75));
    expect(r).toEqual({ left: 10, right: 5, bias: 5 });
  });
});
