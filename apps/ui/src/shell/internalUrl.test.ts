import { describe, expect, it } from 'vitest';
import { formatInternalUrl, parseInternalUrl } from './internalUrl';

describe('internal URLs', () => {
  it('parses page, path and query', () => {
    const u = parseInternalUrl('newpaper://ajustes/red?x=1')!;
    expect(u.page).toBe('ajustes');
    expect(u.path).toEqual(['red']);
    expect(u.query.get('x')).toBe('1');
  });
  it('round-trips encoded URLs in the path', () => {
    const url = formatInternalUrl('hemeroteca', ['https://elpais.com/a?b=1']);
    expect(url).toBe('newpaper://hemeroteca/https%3A%2F%2Felpais.com%2Fa%3Fb%3D1');
    expect(parseInternalUrl(url)!.path).toEqual(['https://elpais.com/a?b=1']);
  });
  it('handles queries and rejects other schemes', () => {
    expect(formatInternalUrl('inicio', [], { q: 'smi & empleo' })).toBe('newpaper://inicio?q=smi+%26+empleo');
    expect(parseInternalUrl('newpaper://inicio?q=smi%20%26%20empleo')!.query.get('q')).toBe('smi & empleo');
    expect(parseInternalUrl('https://a.example/')).toBeNull();
    expect(parseInternalUrl('NEWPAPER://Inicio')!.page).toBe('inicio');
  });
});
