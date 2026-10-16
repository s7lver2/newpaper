import { useI18n } from '@newpaper/i18n/react';
import { useEffect, useRef } from 'react';
import intro, { type IntroMode } from './splash/intro-engine';
import { barsOverDark } from './theme';

/** Lienzo lógico del motor (coordenadas 390×844). Se escala a cubrir la pantalla. */
const LW = 390;
const LH = 844;
/** Tope de devicePixelRatio por calidad (0 = la mejor). La intro es pintura y papel: 1,5 basta y alivia el relleno de píxeles. */
const DPR_CAP = [1.5, 1.25, 1] as const;
/** Mediana de fotogramas por encima de esto (ms): baja una calidad. 18 ms deja margen a 60 Hz (16,7) y detecta 30 fps. */
const SLOW_MEDIAN_MS = 18;
const WINDOW = 12;
/** Fotogramas ignorados tras empezar y tras cada bajada (compilación JIT, redimensionado). */
const GRACE = 8;
/** Tiempo mínimo de intro antes de que tocar la pantalla pueda saltar al final. */
const SKIP_AFTER_MS = 600;
/** Iris acelerado al saltar (ms): mismo final, menos espera. */
const SKIP_IRIS_MS = 200;

declare global {
  interface Window {
    NP_INTRO_READY?: boolean;
  }
}

/**
 * Intro de arranque (Movil-Splash / M16). Canvas 2D que llama al motor con el tiempo de requestAnimationFrame: el primer
 * fotograma es el del splash nativo (`draw(0)`, ya sin hojas), y tras pintarlo se marca `window.NP_INTRO_READY` para que
 * Android retire su splash (ver MainActivity). Al terminar, el iris (un círculo transparente que se abre en el propio
 * lienzo, sin máscaras CSS) descubre la app por debajo. Sin React durante la animación: todo va por refs y estilos directos.
 */
export function Splash({ mode, ready, onDone }: { mode: IntroMode; ready: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const done = useRef(false);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) {
      onDone();
      return;
    }
    barsOverDark(true);

    let raf = 0;
    let t0 = 0;
    let skipAt = 0;
    let last = 0;
    let quality: 0 | 1 | 2 = 0;
    const deltas = new Float32Array(WINDOW);
    const sorted = new Float32Array(WINDOW);
    let nd = 0;
    let grace = GRACE;
    const total = intro.TOT[mode];
    const holdStart = mode === 'reduce' ? total : total - intro.IRIS[mode] - intro.HOLD[mode];
    let scale = 1;
    let stillDrawn = false;
    let covered = true;

    /** Canvas a pantalla completa; el motor dibuja en coordenadas lógicas y se escala a cubrir (cover). */
    const fit = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP[quality]);
      el.width = Math.round(vw * dpr);
      el.height = Math.round(vh * dpr);
      scale = Math.max(vw / LW, vh / LH);
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, ((vw - LW * scale) / 2) * dpr, ((vh - LH * scale) / 2) * dpr);
      stillDrawn = false;
    };
    const onResize = () => fit();
    // Calidad inicial según lo que cuesta de verdad el remolino en este dispositivo (se mide durante el splash nativo).
    intro.init();
    quality = intro.calibrate();
    intro.setQuality(quality);
    fit();
    window.addEventListener('resize', onResize);

    // El icono del splash nativo no puede ser tan grande como la marca del canvas (Android lo recorta a un circulo): mide
    // 54 u * 1,08 * 288/108 dp. El canvas arranca a ese tamano (escala desde el centro) y crece al suyo en 380 ms, asi
    // no hay salto de tamano en el traspaso. La animacion la lleva el compositor (Web Animations) y arranca con la intro.
    const nativeDp = 54 * 1.08 * (288 / 108);
    const canvasDp = 227 * scale;
    const from = Math.min(1, nativeDp / canvasDp);
    el.style.transformOrigin = '50% 50%';
    el.style.transform = `scale(${from})`;

    const finish = () => {
      if (done.current) return;
      done.current = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      barsOverDark(false);
      onDone();
    };

    /** Mediana de los últimos fotogramas; si pasa de SLOW_MEDIAN_MS baja una calidad (solo baja, nunca sube). */
    const govern = (dt: number) => {
      if (dt > 250) return; // pestaña oculta o pausa del sistema: no es rendimiento
      if (grace > 0) {
        grace -= 1;
        return;
      }
      deltas[nd % WINDOW] = dt;
      nd += 1;
      if (nd < WINDOW) return;
      sorted.set(deltas);
      sorted.sort();
      const med = (sorted[WINDOW / 2 - 1]! + sorted[WINDOW / 2]!) / 2;
      if (med > SLOW_MEDIAN_MS && quality < 2) {
        quality = (quality + 1) as 0 | 1 | 2;
        intro.setQuality(quality);
        fit();
        nd = 0;
        grace = GRACE;
      }
    };

    /** Iris: agujero transparente centrado en el propio lienzo (el fondo del contenedor pasa a transparente al empezar). */
    const punch = (r: number) => {
      if (covered) {
        covered = false;
        if (root.current) root.current.style.background = 'transparent';
      }
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(LW / 2, LH / 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    // El splash nativo se retira cuando la web avisa; si lo hace antes de que el sistema haya presentado el lienzo, hay un
    // parpadeo (la marca fantasma desaparece y vuelve). Se esperan tres fotogramas pintados con draw(0) antes de avisar y
    // de arrancar el reloj de la intro.
    let warm = 0;
    const frame = (now: number) => {
      if (warm < 3) {
        warm += 1;
        intro.draw(ctx, 0, mode);
        if (warm === 3) {
          window.NP_INTRO_READY = true;
          document.documentElement.dataset.introReady = '1';
        }
        raf = requestAnimationFrame(frame);
        return;
      }
      if (!t0) {
        t0 = now;
        last = now;
        // Crecimiento del canvas hasta su tamaño: lo lleva el compositor.
        el.animate([{ transform: `scale(${from})` }, { transform: 'scale(1)' }], { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
      }
      const dt = now - last;
      last = now;
      const tm = now - t0;

      if (skipAt) {
        // Salto por toque: el logo formado y un iris corto (o un fundido en movimiento reducido).
        const k = intro.sm(0, SKIP_IRIS_MS, now - skipAt);
        if (mode === 'reduce') el.style.opacity = String(1 - k);
        else {
          if (!stillDrawn) {
            intro.draw(ctx, holdStart, mode);
            stillDrawn = true;
          }
          punch(920 * k);
        }
        if (now - skipAt >= SKIP_IRIS_MS) return finish();
        raf = requestAnimationFrame(frame);
        return;
      }

      if (tm >= total) return finish();
      const h = intro.hand(tm, mode);
      if (mode === 'reduce') {
        intro.draw(ctx, tm, mode);
        if (h.fade > 0) el.style.opacity = String(1 - h.fade);
      } else if (intro.still(tm, mode)) {
        // Pausa con el logo formado: el fotograma no cambia; solo se abre el iris sobre lo ya pintado.
        if (!stillDrawn) {
          intro.draw(ctx, tm, mode);
          stillDrawn = true;
        }
        if (h.iris > 0) punch(h.iris);
      } else {
        govern(dt);
        intro.draw(ctx, tm, mode);
      }
      raf = requestAnimationFrame(frame);
    };

    // Primer fotograma en el mismo instante que el splash nativo: texturas a la GPU y draw(0) con el canvas ya dimensionado.
    if (mode !== 'reduce') intro.prewarm(ctx);
    intro.draw(ctx, 0, mode);
    raf = requestAnimationFrame(frame);

    // Tocar la pantalla salta al final (iris en 200 ms) cuando Hoy ya está listo y la intro lleva un rato.
    const tap = () => {
      if (!readyRef.current || done.current || !t0 || skipAt) return;
      const tm = performance.now() - t0;
      if (tm < SKIP_AFTER_MS || tm >= total - SKIP_IRIS_MS) return;
      skipAt = performance.now();
    };
    el.addEventListener('pointerdown', tap);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      el.removeEventListener('pointerdown', tap);
      barsOverDark(false);
    };
    // La intro corre una sola vez por montaje; `ready` se lee con ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div ref={root} className="m-intro" role="status" aria-label={t('mobile.splash.label')}>
      <canvas ref={canvas} className="m-intro-canvas" aria-hidden="true" />
    </div>
  );
}
