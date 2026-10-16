// Tipos del motor de la intro (intro-engine.js es una copia de design/mockups/tools/intro-engine.js, solo cambian los saltos de línea).
// Vite añade `export default NPIntro` en la carga (ver vite.config.ts); la API no cambia.
export type IntroMode = 'first' | 'short' | 'reduce';
export interface IntroEngine {
  readonly W: number;
  readonly H: number;
  /** Duración total en ms reales (coreografía + pausa + iris). */
  readonly TOT: { first: number; short: number; reduce: number };
  /** Duración del iris (ms reales) por modo; empieza en TOT - IRIS. */
  readonly IRIS: { first: number; short: number };
  /** Pausa (ms reales) con el logo formado antes del iris. */
  readonly HOLD: { first: number; short: number };
  /** Prepara sprites y tablas (idempotente); se puede llamar antes del primer fotograma. */
  init(): void;
  /** Sube las texturas a la GPU del contexto dado (alfa casi nulo); llamar justo antes de draw(0). */
  prewarm(ctx: CanvasRenderingContext2D): void;
  /** Mide el coste del remolino y devuelve la calidad inicial recomendada (0..2). */
  calibrate(): 0 | 1 | 2;
  draw(ctx: CanvasRenderingContext2D, t: number, mode: IntroMode): void;
  drawNative(ctx: CanvasRenderingContext2D): void;
  /** Radio del iris (px lógicos, 0 mientras no empieza) y fundido (solo movimiento reducido). Devuelve un objeto reutilizado. */
  hand(t: number, mode: IntroMode): { iris: number; fade: number };
  /** El fotograma ya no cambia (pausa e iris): no hace falta redibujar. */
  still(t: number, mode: IntroMode): boolean;
  internal(t: number, mode: IntroMode): number;
  setQuality(q: 0 | 1 | 2): void;
  sm(a: number, b: number, x: number): number;
}
declare const engine: IntroEngine;
export default engine;
