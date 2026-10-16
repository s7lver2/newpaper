import noticia from '../test/fixtures/noticia.html?raw';
import { describe, expect, it } from 'vitest';
import { extractFromHtml, normalizeText } from './index';

const NBSP = String.fromCharCode(160);
const ZWSP = String.fromCharCode(0x200b);
const SHY = String.fromCharCode(0xad);
const NNBSP = String.fromCharCode(0x202f);

describe('normalizeText', () => {
  it('turns NBSP, zero-width chars and stray line breaks into one canonical text', () => {
    const raw = `El${NBSP}Real  Madrid\r\nexige${ZWSP} la dimisión.\n \nSegundo${NNBSP}párrafo${SHY} aquí.\n\n\n\nTercero.`;
    expect(normalizeText(raw)).toBe('El Real Madrid exige la dimisión.\n\nSegundo párrafo aquí.\n\nTercero.');
  });
  it('is idempotent', () => {
    const once = normalizeText(`a${NBSP} b\n\n\n c\n d`);
    expect(normalizeText(once)).toBe(once);
  });
  it('keeps the extractor output canonical, so analysis offsets and reader text are the same string', () => {
    const html = noticia.replace('2,5 millones', `2,5${NBSP}millones   de  `);
    const a = extractFromHtml(html, 'https://diario.example/economia/smi');
    expect(a).not.toBeNull();
    expect(normalizeText(a!.text)).toBe(a!.text);
    expect(a!.text).toContain('2,5 millones de');
    expect(a!.text.includes(NBSP)).toBe(false);
    expect(a!.text).not.toMatch(/ {2}|(?<!\n)\n(?!\n)|\n{3}|^\s|\s$/);
  });
});
