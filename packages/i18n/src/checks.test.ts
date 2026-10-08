import { describe, expect, it } from 'vitest';
import { argumentMismatches, findHardcodedText, invalidMessages, missingKeys } from './checks';

const cats = {
  es: { a: 'Hola {name}', b: 'Uno', c: 'Roto {' },
  en: { a: 'Hello {nombre}', b: 'One' },
  de: { a: 'Hallo {name}', b: 'Eins', c: 'Kaputt' },
};

describe('catalog checks', () => {
  it('lists keys missing per locale', () => {
    expect(missingKeys(cats)).toEqual({ es: [], en: ['c'], de: [] });
  });
  it('reports invalid ICU messages', () => {
    expect(invalidMessages(cats).map((m) => `${m.locale}:${m.key}`)).toEqual(['es:c']);
  });
  it('reports different placeholders between locales', () => {
    expect(argumentMismatches(cats)).toEqual([{ key: 'a', locales: { es: ['name'], en: ['nombre'], de: ['name'] } }]);
  });
});

describe('findHardcodedText', () => {
  it('flags JSX text and user-facing string attributes', () => {
    const src = [
      'export const A = () => (',
      '  <div title="Ajustes de red">',
      '    <h1>Bienvenido</h1>',
      '    <p>{t("x")}</p>',
      '    <span>·</span>',
      '    <b>42</b>',
      '    <img alt={t("y")} />',
      '    <i aria-label="Cerrar" className="np-icon" />',
      '  </div>',
      ');',
    ].join('\n');
    expect(findHardcodedText(src, 'A.tsx')).toEqual([
      { file: 'A.tsx', line: 2, text: 'Ajustes de red' },
      { file: 'A.tsx', line: 3, text: 'Bienvenido' },
      { file: 'A.tsx', line: 8, text: 'Cerrar' },
    ]);
  });

  it('allows brand names and lines marked with i18n-ignore', () => {
    const src = ['const B = () => <>', '  <b>newpaper</b>', '  <b>Tor</b>', '  {/* i18n-ignore */}<code>RSS</code>', '</>;'].join('\n');
    expect(findHardcodedText(src, 'B.tsx')).toEqual([]);
  });
});