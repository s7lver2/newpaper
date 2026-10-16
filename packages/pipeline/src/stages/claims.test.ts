import { describe, expect, it } from 'vitest';
import { SMI_ARTICLE, SMI_TEXT } from '../test/fixtures';
import { textModel } from '../test/mock';
import { detectClaims, repairSpans } from './claims';

const ctx = (out: string) => ({ model: textModel(out), noTemperature: false, temperature: 0, locale: 'es' as const });

describe('repairSpans', () => {
  it('fixes wrong spans, keeps right ones and drops quotes not in the text', () => {
    const q = 'beneficiará a 2,5 millones de trabajadores';
    const at = SMI_TEXT.indexOf(q);
    const out = repairSpans(SMI_TEXT, [
      { quote: q, span: [0, 5] },
      { quote: 'fiel a su costumbre', span: [SMI_TEXT.indexOf('fiel'), SMI_TEXT.indexOf('fiel') + 19] },
      { quote: 'una frase inventada', span: [0, 10] },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]!.span).toEqual([at, at + q.length]);
    expect(SMI_TEXT.slice(...out[1]!.span)).toBe('fiel a su costumbre');
  });
});

describe('detectClaims', () => {
  it('returns validated claims with unique ids and repaired spans', async () => {
    const out = JSON.stringify({
      claims: [
        { id: 'x', quote: 'el nivel más alto de toda Europa', span: [0, 0], kind: 'cifra', checkable: true },
        { id: 'x', quote: 'ha crecido un 61 %', span: [0, 0], kind: 'cifra', checkable: true },
        { id: 'y', quote: 'no aparece en el texto', span: [0, 0], kind: 'hecho', checkable: true },
      ],
      loadedPhrases: [{ quote: 'un apocalipsis de empleo que nunca llega', span: [0, 0], reason: 'Hipérbole' }],
    });
    const c = ctx(out);
    const r = await detectClaims(c, SMI_ARTICLE, { quick: false });
    expect(r.value.claims.map((x) => x.id)).toEqual(['c1', 'c2']);
    expect(SMI_TEXT.slice(...r.value.claims[1]!.span)).toBe('ha crecido un 61 %');
    expect(r.value.loadedPhrases).toHaveLength(1);
    const prompt = JSON.stringify(c.model.doGenerateCalls[0]!.prompt);
    expect(prompt).toContain('<<<DATA ARTICLE');
    expect(prompt).not.toContain('El Diario Rojo');
  });

  it('quick mode asks only for loaded phrases', async () => {
    const c = ctx(JSON.stringify({ claims: [], loadedPhrases: [] }));
    await detectClaims(c, SMI_ARTICLE, { quick: true });
    expect(JSON.stringify(c.model.doGenerateCalls[0]!.prompt)).toMatch(/only loaded phrases/i);
  });
});

describe('repairSpans (lenient)', () => {
  it('relocates quotes that differ in case, quotes, dashes or whitespace, or a near-identical sentence; drops loose paraphrases', () => {
    const text = 'El ataque dejó 13 muertos y 32 heridos.\n\nSerá la primera ejecución militar desde 1961 — dijo el Pentágono.\n\nLa fiscalía pidió al tribunal que aceptara las pruebas presentadas por la defensa durante la vista oral.';
    const out = repairSpans(text, [
      { quote: 'EL ATAQUE dejó 13  muertos y 32 heridos', span: [0, 0] as [number, number] },
      { quote: 'primera ejecución militar desde 1961 - dijo', span: [0, 0] as [number, number] },
      // Una sola palabra distinta en una frase larga: parecido alto, se ancla en la frase.
      { quote: 'La fiscalía pidió al tribunal que admitiera las pruebas presentadas por la defensa durante la vista oral.', span: [0, 0] as [number, number] },
      // Parafraseada con otras palabras: parecido bajo, se descarta en vez de marcar «alguna» frase.
      { quote: 'El ataque dejó 13 muertos y 32 personas heridas', span: [0, 0] as [number, number] },
    ]);
    expect(out).toHaveLength(3);
    for (const o of out) expect(text.slice(...o.span)).toBe(o.quote);
  });
});

describe('detectClaims failure', () => {
  it('throws when the model returned claims but none can be located', async () => {
    const out = JSON.stringify({ claims: [{ id: 'a', quote: 'zzz qqq xxx', span: [0, 3], kind: 'hecho', checkable: true }], loadedPhrases: [] });
    await expect(detectClaims(ctx(out), SMI_ARTICLE, { quick: false })).rejects.toThrow(/located/);
  });
});
