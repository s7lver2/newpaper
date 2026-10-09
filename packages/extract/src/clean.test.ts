import portada from '../test/fixtures/portada.html?raw';
import muro from '../test/fixtures/muro.html?raw';
import completo from '../test/fixtures/completo.html?raw';
import noticia from '../test/fixtures/noticia.html?raw';
import { describe, expect, it } from 'vitest';
import { bestCandidate, classifyPage, collectSignals, extractArticle, extractListing, isCtaText, listingPathScore, parseSrcset, siteKey } from './index';
import { buildPageMessage } from './message';

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('images', () => {
  it('parses srcset with commas in URLs and picks the biggest candidate within 1600 px', () => {
    const c = parseSrcset('https://x/a.jpg?w=1,2 480w, https://x/b.jpg 960w, https://x/c.jpg 2400w');
    expect(c.map((x) => x.width)).toEqual([480, 960, 2400]);
    expect(bestCandidate(c)).toBe('https://x/b.jpg');
    expect(bestCandidate(parseSrcset('data:image/gif;base64,AAAA 1w'))).toBeNull();
  });
});

describe('paywall text', () => {
  it('recognises subscription calls to action in es/en/de but not ordinary sentences', () => {
    for (const t of ['Suscríbete para seguir leyendo', 'Lee sin límites', 'Inicia sesión', 'Subscribe to continue reading', 'Jetzt weiterlesen mit Abo', 'Ya eres suscriptor?']) {
      expect(isCtaText(t), t).toBe(true);
    }
    expect(isCtaText('Los suscriptores de la web crecieron un diez por ciento durante el pasado ejercicio, según la editora.')).toBe(false);
    expect(isCtaText('El Gobierno defendió una ideología')).toBe(false);
  });
});

describe('subscription-limited articles', () => {
  it('cuts at the wall, drops hidden and trailing text, and flags the article as limited', () => {
    const a = extractArticle(parse(muro), 'https://diario.example/politica/2026-10-08/la-ley-que-cambia-el-ano.html')!;
    expect(a).not.toBeNull();
    expect(a.limited).toBe(true);
    expect(a.text).toContain('ideología que agi');
    expect(a.text).not.toMatch(/Suscríbete|Lee sin límites|Inicia sesión/);
    expect(a.text).not.toContain('de la crueldad');
    expect(a.text).not.toContain('patronal');
  });
  it('keeps a complete article intact, removes duplicated paragraphs and CTA lines only', () => {
    const a = extractArticle(parse(completo), 'https://diario.example/a/2026-10-08/completo-y-gratuito.html')!;
    expect(a.limited).toBe(false);
    expect(a.text.split('Los sindicatos').length - 1).toBe(1);
    expect(a.text).not.toContain('Hazte socio');
    expect(a.text).toContain('Los suscriptores de la web crecieron');
    expect(a.text).toContain('articulado');
  });
  it('does not flag an ordinary article', () => {
    expect(extractArticle(parse(noticia), 'https://diario.example/economia/smi')!.limited).toBe(false);
  });
});

describe('listing pages', () => {
  const URL_ = 'https://www.diario.example/';
  it('classifies a front page as a listing and an article as an article', () => {
    expect(classifyPage(parse(portada), URL_, collectSignals(parse(portada))).kind).toBe('listing');
    expect(classifyPage(parse(noticia), 'https://diario.example/economia/smi', collectSignals(parse(noticia))).kind).toBe('article');
    expect(listingPathScore('https://x.example/')).toBeGreaterThan(listingPathScore('https://x.example/espana/2026-10-08/titular-largo-de-la-noticia.html'));
  });
  it('extracts deduplicated headlines of the same site without menus or subscription links', () => {
    const items = extractListing(parse(portada), URL_);
    expect(items).toHaveLength(8);
    expect(items[0]).toMatchObject({ section: 'Última hora', image: 'https://img.diario.example/t0.jpg' });
    expect(items[0]!.summary).toContain('Resumen de la noticia');
    expect(items[7]!.section).toBe('Actualidad');
    expect(items.some((i) => /suscri|Suscríbete/i.test(i.title + i.url))).toBe(false);
    expect(new Set(items.map((i) => i.url)).size).toBe(items.length);
  });
  it('buildPageMessage sends kind listing with items and no article body', () => {
    const m = buildPageMessage(parse(portada), URL_);
    expect(m).toMatchObject({ article: false, kind: 'listing', limited: false, html: '' });
    expect(m.items.length).toBe(8);
    expect(siteKey('www.bbc.co.uk')).toBe('bbc.co.uk');
  });
});
