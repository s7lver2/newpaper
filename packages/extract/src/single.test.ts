import scroll from '../test/fixtures/multiples-scroll.html?raw';
import modulo from '../test/fixtures/multiples-modulo.html?raw';
import h1 from '../test/fixtures/multiples-h1.html?raw';
import portada from '../test/fixtures/portada.html?raw';
import noticia from '../test/fixtures/noticia.html?raw';
import { describe, expect, it } from 'vitest';
import { extractFromHtml } from './index';

const URL_ = 'https://diario.example/local/plan-de-movilidad-aprobado-obras-primavera';

describe('one article, not several in a row', () => {
  it('keeps only the article of the page URL when the DOM also holds the next ones', () => {
    const a = extractFromHtml(scroll, URL_)!;
    expect(a.text).toContain('Actual:');
    expect(a.text).not.toContain('Siguiente');
    expect(a.html).not.toContain('equipo local');
  });
  it('drops preloaded "next article" and recommended modules', () => {
    const a = extractFromHtml(modulo, URL_)!;
    expect(a.text).toContain('Principal:');
    expect(a.text).not.toMatch(/Precargada|Recomendada/);
  });
  it('cuts at a second headline that starts the following story', () => {
    const a = extractFromHtml(h1, URL_)!;
    expect(a.text).toContain('Cuerpo:');
    expect(a.text).not.toContain('Otra noticia');
  });
  it('returns null for a front page (a feed link that points to the home) instead of its headlines', () => {
    expect(extractFromHtml(portada, 'https://www.diario.example/')).toBeNull();
  });
  it('returns null for a section URL without article metadata even when headlines are not link-wrapped', () => {
    const html = '<html><head><title>Inicio</title></head><body>' + '<p>' + 'Titular de portada con resumen largo de la noticia del día. '.repeat(12) + '</p>'.repeat(1) + '</body></html>';
    expect(extractFromHtml(html, 'https://diario.example/home')).toBeNull();
  });
  it('leaves an ordinary article untouched', () => {
    const a = extractFromHtml(noticia, 'https://diario.example/economia/smi')!;
    expect(a.text).toContain('2,5 millones de trabajadores');
  });
});
