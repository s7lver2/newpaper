import { describe, expect, it } from 'vitest';
import { guessSurface } from './ReaderLoading';

describe('guessSurface', () => {
  it('front pages and sections get the listing skin', () => {
    expect(guessSurface('https://elpais.com/')).toBe('listing');
    expect(guessSurface('https://elpais.com/espana/')).toBe('listing');
    expect(guessSurface('https://www.bbc.com/news')).toBe('listing');
  });
  it('article URLs get the article skin', () => {
    expect(guessSurface('https://elpais.com/espana/2026-10-09/el-gobierno-aprueba-la-ley.html')).toBe('article');
    expect(guessSurface('https://www.theguardian.com/world/2026/oct/09/some-story')).toBe('article');
  });
  it('bad URLs fall back to the article skin', () => expect(guessSurface('nope')).toBe('article'));
});
