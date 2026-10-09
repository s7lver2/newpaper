import { describe, expect, it } from 'vitest';
import { paragraphRanges, segmentText } from './segmentText';

const text = 'Hola mundo cruel';

describe('segmentText', () => {
  it('splits at every mark boundary and keeps overlapping marks by priority', () => {
    const s = segmentText(text, [
      { id: 'b', start: 0, end: 10, kind: 'cargada', priority: 1 },
      { id: 'a', start: 5, end: 10, kind: 'falso', priority: 2 },
    ]);
    expect(s.map((x) => [x.text, x.marks.map((m) => m.id)])).toEqual([
      ['Hola ', ['b']],
      ['mundo', ['a', 'b']],
      [' cruel', []],
    ]);
  });

  it('ignores empty, inverted and out-of-range marks', () => {
    const s = segmentText(text, [
      { id: 'x', start: 20, end: 30, kind: 'falso' },
      { id: 'y', start: 7, end: 3, kind: 'falso' },
      { id: 'z', start: 4, end: 4, kind: 'falso' },
    ]);
    expect(s).toEqual([{ start: 0, end: 16, text, marks: [] }]);
  });

  it('works inside a paragraph with absolute offsets', () => {
    const t = 'Uno.\n\nDos tres.\n\n\nCuatro.';
    const ranges = paragraphRanges(t);
    expect(ranges.map((r) => t.slice(r.start, r.end))).toEqual(['Uno.', 'Dos tres.', 'Cuatro.']);
    const p = ranges[1]!;
    const seg = segmentText(t, [{ id: 'm', start: t.indexOf('tres'), end: t.indexOf('tres') + 4, kind: 'cargada' }, { id: 'n', start: 0, end: 3, kind: 'falso' }], p.start, p.end);
    expect(seg.map((x) => x.text).join('')).toBe('Dos tres.');
    expect(seg.find((x) => x.text === 'tres')!.start).toBe(t.indexOf('tres'));
    expect(seg.some((x) => x.marks.some((m) => m.id === 'n'))).toBe(false);
  });
});
