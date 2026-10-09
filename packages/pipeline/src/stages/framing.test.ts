import { describe, expect, it } from 'vitest';
import { combineFraming, DEFAULT_WEIGHTS, validateEvidence, type JudgeOutput } from './framing';

const docA = 'La patronal, fiel a su costumbre, amenaza con un apocalipsis de empleo. Los sindicatos celebran la subida.';
const judge = (p: Partial<JudgeOutput> = {}): JudgeOutput => ({
  signals: [
    { kind: 'adjetivacion', value: -0.8, evidence: ['fiel a su costumbre'] },
    { kind: 'encuadre', value: -0.6, evidence: ['apocalipsis de empleo'] },
    { kind: 'atribucion', value: -0.5, evidence: ['frase que no está en el texto'] },
  ],
  actors: [{ name: 'Sindicatos', quotes: 2, side: 'left' }, { name: 'Gobierno', quotes: 1, side: 'left' }, { name: 'Patronal', quotes: 0, side: 'right' }],
  lastWordSide: 'left',
  omissions: [{ fact: 'La AIReF estima pérdida de empleo', favors: 'right', foundIn: 'Documento B' }],
  ...p,
});

describe('validateEvidence', () => {
  it('drops signals whose quotes are not literally in the document and omissions not found elsewhere', () => {
    const others = new Map([['Documento B', 'La AIReF estima pérdida de empleo en el campo.']]);
    const v = validateEvidence(judge({ omissions: [...judge().omissions, { fact: 'Inventado', favors: 'left', foundIn: 'Documento C' }] }), docA, others);
    expect(v.signals.map((s) => s.kind)).toEqual(['adjetivacion', 'encuadre']);
    expect(v.omissions).toHaveLength(1);
  });
});

describe('combineFraming (§5.2.1.6)', () => {
  it('places a left-leaning text left of the group centre with evidence and a confidence interval', () => {
    const s = combineFraming({ judge: validateEvidence(judge(), docA, new Map([['Documento B', 'La AIReF estima pérdida de empleo']])), lexiconRel: { value: -0.5, confidence: 0.6, evidence: ['justicia social'] }, groupCenter: 50, loadedPhrases: 2, weights: DEFAULT_WEIGHTS });
    expect(s.verdict).not.toBe('no_determinable');
    expect(s.framing!).toBeLessThan(40);
    expect(s.interval![0]).toBeLessThan(s.framing!);
    expect(s.signals.find((x) => x.source === 'lexicon')!.evidence).toEqual(['justicia social']);
    expect(s.signals.find((x) => x.kind === 'voces')!.value).toBeLessThan(0);
    expect(s.omissions).toEqual(['La AIReF estima pérdida de empleo']);
    expect(s.neutrality).toBeLessThan(70);
  });

  it('is not determinable when signals are weak or contradictory', () => {
    const weak = combineFraming({ judge: { signals: [], actors: [], lastWordSide: null, omissions: [] }, lexiconRel: null, groupCenter: 50, loadedPhrases: 0, weights: DEFAULT_WEIGHTS });
    expect(weak).toMatchObject({ framing: null, verdict: 'no_determinable', interval: null });
    const contradictory = combineFraming({
      judge: { signals: [{ kind: 'encuadre', value: 0.9, evidence: ['x'] }], actors: [], lastWordSide: null, omissions: [] },
      lexiconRel: { value: -0.9, confidence: 0.3, evidence: ['y'] },
      groupCenter: 50, loadedPhrases: 0, weights: DEFAULT_WEIGHTS,
    });
    expect(contradictory.verdict).toBe('no_determinable');
  });

  it('is relative to the group centre, not to 50', () => {
    const s = combineFraming({ judge: { signals: [{ kind: 'encuadre', value: 0, evidence: ['a'] }, { kind: 'adjetivacion', value: 0, evidence: ['b'] }, { kind: 'orden', value: 0, evidence: ['c'] }], actors: [], lastWordSide: null, omissions: [] }, lexiconRel: { value: 0, confidence: 0.8, evidence: ['z'] }, groupCenter: 62, loadedPhrases: 0, weights: DEFAULT_WEIGHTS });
    expect(s.framing).toBe(62);
    expect(s.verdict).toBe('neutral');
  });
});
