import { describe, expect, it } from 'vitest';
import { clampShift } from './popoverClamp';

describe('clampShift', () => {
  it('leaves a popover that fits alone', () => expect(clampShift(100, 300, 900)).toBe(0));
  it('pushes a popover cut by the left edge back inside', () => expect(clampShift(-200, 380, 900)).toBe(208));
  it('pulls a popover cut by the right edge back inside', () => expect(clampShift(700, 380, 900)).toBe(-188));
  it('prefers the left margin when it cannot fit', () => expect(clampShift(50, 500, 400)).toBe(-42));
});
