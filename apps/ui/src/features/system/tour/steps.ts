export type MarkId = 'lens' | 'phrase' | 'score' | 'neutral' | 'tor' | 'settings';

/** Marcas reales de la interfaz: cada una se localiza en el DOM por su atributo `data-tour` o su clase. */
export const MARKS: { id: MarkId; selector: string }[] = [
  { id: 'lens', selector: '[data-tour="lens"]' },
  { id: 'phrase', selector: '.np-lens mark' },
  { id: 'score', selector: '.np-ring' },
  { id: 'neutral', selector: '[data-tour="neutral"]' },
  { id: 'tor', selector: '[data-tour="tor"]' },
  { id: 'settings', selector: '[data-tour="settings"]' },
];

export type TourStep = { kind: 'welcome' } | { kind: 'topics' } | { kind: 'ai' } | { kind: 'network' } | { kind: 'mark'; mark: MarkId } | { kind: 'done' };

export const STEPS: TourStep[] = [
  { kind: 'welcome' },
  { kind: 'topics' },
  { kind: 'ai' },
  { kind: 'network' },
  ...MARKS.map((m) => ({ kind: 'mark' as const, mark: m.id })),
  { kind: 'done' },
];
