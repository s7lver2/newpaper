// Tipos del motor de la intro (intro-engine.js es una copia byte a byte de design/mockups/tools/intro-engine.js).
// Vite añade `export default NPIntro` en la carga (ver vite.config.ts); la API no cambia.
export type IntroMode = 'first' | 'short' | 'reduce';
export interface IntroEngine {
  readonly W: number;
  readonly H: number;
  readonly TOT: { first: number; short: number; reduce: number };
  draw(ctx: CanvasRenderingContext2D, t: number, mode: IntroMode): void;
  drawNative(ctx: CanvasRenderingContext2D): void;
  /** Radio del iris (px lógicos, 0 mientras no empieza) y fundido de la capa DOM. */
  hand(t: number, mode: IntroMode): { iris: number; fade: number };
  setQuality(q: 0 | 1 | 2): void;
  sm(a: number, b: number, x: number): number;
}
declare const engine: IntroEngine;
export default engine;
