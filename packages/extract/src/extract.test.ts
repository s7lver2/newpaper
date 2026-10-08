import noticia from '../test/fixtures/noticia.html?raw';
import otra from '../test/fixtures/no-noticia.html?raw';
import { describe, expect, it } from 'vitest';
import { collectSignals, extractArticle, extractFromHtml, looksLikeNews, LIMITS } from './index';

const URL_ = 'https://diario.example/economia/smi';

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('collectSignals', () => {
  it('reads og:type and JSON-LD types', () => {
    const s = collectSignals(parse(noticia));
    expect(s).toEqual({ ogType: 'article', jsonLdTypes: ['NewsArticle'] });
    expect(looksLikeNews(s)).toBe(true);
  });
  it('handles pages without metadata and broken JSON-LD', () => {
    const doc = parse('<html><head><script type="application/ld+json">{oops</script></head><body></body></html>');
    expect(collectSignals(doc)).toEqual({ ogType: null, jsonLdTypes: [] });
    expect(looksLikeNews(collectSignals(parse(otra)))).toBe(false);
  });
  it('finds types inside @graph and arrays', () => {
    const doc = parse('<script type="application/ld+json">{"@graph":[{"@type":"WebPage"},{"@type":["ReportageNewsArticle"]}]}</script>');
    expect(collectSignals(doc).jsonLdTypes).toEqual(['WebPage', 'ReportageNewsArticle']);
  });
});

describe('extractArticle', () => {
  it('extracts title, byline, site, date, lang, html and text', () => {
    const doc = parse(noticia);
    const a = extractArticle(doc, URL_)!;
    expect(a.url).toBe(URL_);
    expect(a.title).toBe('El SMI sube a 1.184 euros');
    expect(a.siteName).toBe('Diario de Prueba');
    expect(a.published).toBe('2026-10-06T08:00:00+02:00');
    expect(a.lang).toBe('es');
    expect(a.text).toContain('2,5 millones de trabajadores');
    expect(a.html).not.toContain('<script');
    expect(a.html).toContain('https://diario.example/img/smi.jpg');
    expect(doc.querySelector('nav')).not.toBeNull();
  });
  it('returns null for non-article pages', () => {
    expect(extractArticle(parse(otra), 'https://tienda.example/')).toBeNull();
  });
  it('truncates oversized fields to LIMITS', () => {
    const big = noticia.replace('<h1>El SMI', `<h1>${'x'.repeat(5000)} El SMI`);
    expect(extractArticle(parse(big), URL_)!.title.length).toBeLessThanOrEqual(LIMITS.title);
  });
});

describe('extractFromHtml', () => {
  it('parses raw HTML without running scripts', () => {
    const a = extractFromHtml(noticia, URL_)!;
    expect(a.title).toBe('El SMI sube a 1.184 euros');
    expect((window as unknown as { evil?: number }).evil).toBeUndefined();
  });
});
