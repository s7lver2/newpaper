import { describe, expect, it } from 'vitest';
import type { ArticleInput } from '../schemas/article';
import { locate, sentenceSpans } from '../text/anchor';
import { textModel } from '../test/mock';
import { detectClaims } from './claims';

/**
 * Banco de pruebas con salidas «tipo Gemini» (no se llama a ningún proveedor real): reproduce los fallos típicos de los
 * modelos al devolver citas y desplazamientos, para comprobar que lo marcado en el lector es siempre lo que dice la cita.
 */
const P1 = 'El conflicto institucional entre el Real Madrid y el presidente de LaLiga Javier Tebas ha alcanzado un punto de no retorno.';
const P2 = 'La entidad presidida por Florentino Pérez ha hecho pública una declaración oficial en la que solicita la salida irrevocable del dirigente de todas sus responsabilidades de gobierno en la patronal del fútbol español.';
const P3 = 'La enérgica reacción del club blanco se produjo tras las palabras del dirigente, que comparó la televisión del club con la propaganda nazi.';
const P4 = 'La entidad madridista afea la pasividad mostrada por las instituciones nacionales y recuerda que se vio obligada a acudir a la UEFA para reclamar "el completo esclarecimiento de los pagos realizados durante años por el F. C. Barcelona." al entorno arbitral.';
const P5 = 'Según el comunicado, el club considera "inaceptable" la comparación. Tebas ha defendido su postura en una entrevista. El presidente de LaLiga insistió en que nadie ha querido ofender a nadie.';
const TEXT = [P1, P2, P3, P4, P5].join('\n\n');
const ARTICLE: ArticleInput = { url: 'https://elespanol.example/real-madrid-tebas', title: 'El Real Madrid exige la dimisión de Tebas', text: TEXT, lang: 'es', siteName: 'El Español' };
const ctx = (out: unknown) => ({ model: textModel(JSON.stringify(out)), noTemperature: false, temperature: 0, locale: 'es' as const });
const quoteOf = (r: { quote: string; span: [number, number] }) => TEXT.slice(...r.span) === r.quote;

describe('Gemini-like claims output', () => {
  it('ignores wrong offsets (counted on another normalization) and anchors by quote', async () => {
    const claims = [
      { id: 'c1', quote: 'ha hecho pública una declaración oficial en la que solicita la salida irrevocable del dirigente', span: [3, 40], kind: 'atribucion', checkable: true },
      { id: 'c2', quote: 'comparó la televisión del club con la propaganda nazi', span: [9999, 10100], kind: 'atribucion', checkable: true },
    ];
    const r = await detectClaims(ctx({ claims, loadedPhrases: [] }), ARTICLE, { quick: false });
    expect(r.value.claims).toHaveLength(2);
    for (const c of r.value.claims) expect(quoteOf(c)).toBe(true);
    expect(r.value.claims[0]!.quote.startsWith('ha hecho pública')).toBe(true);
  });

  it('drops paraphrases instead of highlighting the nearest sentence', async () => {
    const claims = [
      { quote: 'El Real Madrid pide la dimisión de Tebas por llamarle nazi a su canal', kind: 'hecho', checkable: true },
      { quote: 'Tebas dijo que el club es como una dictadura', kind: 'opinion', checkable: false },
      { quote: 'comparó la televisión del club con la propaganda nazi', kind: 'atribucion', checkable: true },
    ];
    const r = await detectClaims(ctx({ claims, loadedPhrases: [] }), ARTICLE, { quick: false });
    expect(r.value.claims.map((c) => c.quote)).toEqual(['comparó la televisión del club con la propaganda nazi']);
  });

  it('rejects whole paragraphs and multi-sentence quotes', async () => {
    const claims = [
      { quote: P2, kind: 'hecho', checkable: true },
      { quote: P5, kind: 'hecho', checkable: true },
      { quote: 'Tebas ha defendido su postura en una entrevista.', kind: 'atribucion', checkable: true },
    ];
    const r = await detectClaims(ctx({ claims, loadedPhrases: [] }), ARTICLE, { quick: false });
    // P2 mide más de 200 caracteres pero es una sola frase: se acepta hasta 240; P5 son tres frases: fuera.
    expect(r.value.claims.map((c) => c.quote)).toEqual([P2, 'Tebas ha defendido su postura en una entrevista.']);
  });

  it('keeps one mark for duplicated and nested claims', async () => {
    const claims = [
      { quote: 'comparó la televisión del club con la propaganda nazi', kind: 'atribucion', checkable: true },
      { quote: 'COMPARÓ LA TELEVISIÓN DEL CLUB CON LA PROPAGANDA NAZI', kind: 'atribucion', checkable: true },
      { quote: 'la televisión del club con la propaganda nazi', kind: 'hecho', checkable: true },
    ];
    const r = await detectClaims(ctx({ claims, loadedPhrases: [] }), ARTICLE, { quick: false });
    expect(r.value.claims).toHaveLength(1);
    expect(r.value.claims[0]!.id).toBe('c1');
  });

  it('handles quotes wrapped in guillemets, with a bracketed translation or an ellipsis', async () => {
    const claims = [
      { quote: '«el club considera "inaceptable" la comparación»', kind: 'atribucion', checkable: true },
      { quote: 'Tebas ha defendido su postura en una entrevista [Tebas defended his position in an interview]', kind: 'atribucion', checkable: true },
      { quote: 'La enérgica reacción del club blanco se produjo ... propaganda nazi.', kind: 'hecho', checkable: true },
    ];
    const r = await detectClaims(ctx({ claims, loadedPhrases: [] }), ARTICLE, { quick: false });
    expect(r.value.claims).toHaveLength(3);
    for (const c of r.value.claims) expect(quoteOf(c)).toBe(true);
  });

  it('does not cut sentences at initials or abbreviations (F. C. Barcelona)', () => {
    const spans = sentenceSpans(P4);
    expect(spans).toHaveLength(1);
    const hit = locate(TEXT, 'La entidad madridista afea la pasividad mostrada por las instituciones nacionales y recuerda que se vio obligada a acudir a la UEFA para reclamar el completo esclarecimiento de los pagos realizados durante años por el F. C. Barcelona al entorno arbitral');
    expect(hit).not.toBeNull();
    expect(TEXT.slice(...hit!.span).endsWith('arbitral.')).toBe(true);
  });

  it('keeps conservative loaded phrases only: 2 to 8 words, not a whole sentence, not overlapping each other', async () => {
    const loaded = [
      { quote: 'enérgica', reason: 'Adjetivo' },
      { quote: 'La enérgica reacción del club blanco se produjo tras las palabras del dirigente, que comparó la televisión del club con la propaganda nazi.', reason: 'Frase entera' },
      { quote: 'propaganda nazi', reason: 'Comparación cargada' },
      { quote: 'comparó la televisión del club con la propaganda nazi', reason: 'Solapa con la anterior' },
      { quote: 'palabras del diri', reason: 'A mitad de palabra' },
      { quote: 'punto de no retorno', reason: 'Hipérbole' },
      { quote: 'sin razón', reason: '' },
    ];
    const r = await detectClaims(ctx({ claims: [], loadedPhrases: loaded }), ARTICLE, { quick: true });
    expect(r.value.loadedPhrases.map((l) => l.quote)).toEqual(['punto de no retorno', 'propaganda nazi'].sort((a, b) => TEXT.indexOf(a) - TEXT.indexOf(b)));
    const sorted = [...r.value.loadedPhrases].sort((a, b) => a.span[0] - b.span[0]);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.span[0]).toBeGreaterThanOrEqual(sorted[i - 1]!.span[1]);
  });

  it('never marks more than a fraction of the article', async () => {
    const claims = [P2, P3, P4].map((q) => ({ quote: q, kind: 'hecho', checkable: true }));
    const r = await detectClaims(ctx({ claims, loadedPhrases: [] }), ARTICLE, { quick: false });
    const marked = r.value.claims.reduce((n, c) => n + (c.span[1] - c.span[0]), 0);
    expect(marked / TEXT.length).toBeLessThanOrEqual(0.4);
  });

  it('works on the canonical text with NBSP-free offsets: a quote typed with a non-breaking space still anchors', () => {
    const nb = String.fromCharCode(160);
    const hit = locate(TEXT, `Javier${nb}Tebas ha alcanzado`);
    // El modelo vio el NBSP del origen; el texto canónico ya no lo tiene: se encuentra igualmente, sin desplazar nada.
    expect(hit).not.toBeNull();
    expect(TEXT.slice(...hit!.span)).toBe('Javier Tebas ha alcanzado');
  });
});
