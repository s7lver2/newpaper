import { describe, expect, it } from 'vitest';
import { anonymize, docLabel } from './anonymize';

describe('anonymize (§5.2.1.1)', () => {
  it('removes outlet names, domains, urls, bylines and self references', () => {
    const t = [
      'Por Ana Pérez. Según fuentes sindicales consultadas por este diario, el SMI ha crecido un 61 %.',
      'Como publicó EL DIARIO ROJO ayer, la patronal se opone. Más en https://eldiariorojo.example/x y en eldiariorojo.example.',
      'Foto: El Diario Rojo / Agencia.',
    ].join('\n');
    const out = anonymize(t, { outletNames: ['El Diario Rojo'], domains: ['eldiariorojo.example'], bylines: ['Ana Pérez'], locale: 'es' });
    expect(out).not.toMatch(/diario rojo/i);
    expect(out).not.toMatch(/eldiariorojo/);
    expect(out).not.toMatch(/Ana Pérez/);
    expect(out).not.toMatch(/este diario/i);
    expect(out).not.toMatch(/Foto:/);
    expect(out).toContain('el SMI ha crecido un 61 %');
    expect(out).toContain('la patronal se opone');
  });

  it('handles english and german self references', () => {
    expect(anonymize('As this newspaper reported, wages rose.', { outletNames: [], domains: [], bylines: [], locale: 'en' })).toBe('wages rose.');
    expect(anonymize('Wie unsere Zeitung berichtete, stieg der Lohn.', { outletNames: [], domains: [], bylines: [], locale: 'de' })).toBe('stieg der Lohn.');
  });

  it('labels documents blindly', () => {
    expect(docLabel(0, 'es')).toBe('Documento A');
    expect(docLabel(2, 'en')).toBe('Document C');
  });
});
