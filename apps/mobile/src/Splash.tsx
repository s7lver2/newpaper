import { useI18n } from '@newpaper/i18n/react';
import { useEffect, useRef, useState } from 'react';
import intro, { type IntroMode } from './splash/intro-engine';
import { barsOverDark } from './theme';

/** Lienzo lógico del motor (coordenadas 390×844). Se escala a cubrir la pantalla. */
const LW = 390;
const LH = 844;
/** Un fotograma más lento que esto baja la calidad del remolino (gama baja). */
const SLOW_MS = 14;
const VERY_SLOW_MS = 20;
/** Tiempo mínimo de intro antes de que tocar la pantalla pueda saltar al final. */
const SKIP_AFTER_MS = 600;
/** Iris acelerado al saltar (ms): mismo final, menos espera. */
const SKIP_IRIS_MS = 200;

declare global {
  interface Window {
    NP_INTRO_READY?: boolean;
  }
}

/** El canvas se oculta dentro de un círculo que crece desde el centro y deja ver la app por debajo (iris). */
const irisMask = (r: number) => `radial-gradient(circle at 50% 50%, transparent ${r}px, #000 ${r + 1}px)`;

/**
 * Intro de arranque (Movil-Splash / M16). Canvas 2D que llama al motor con el tiempo transcurrido: el primer fotograma
 * es el del splash nativo (`draw(0)`, ya sin hojas), y tras pintarlo se marca `window.NP_INTRO_READY` para que
 * Android retire su splash (ver MainActivity). Al terminar, el iris descubre la app por debajo.
 */
export function Splash({ mode, ready, onDone }: { mode: IntroMode; ready: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const canvas = useRef<HTMLCanvasElement | null>(null);
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
    let skipTo: number | null = null;
    let lastFrame = 0;
    const frames: number[] = [];
    let quality: 0 | 1 | 2 = 0;
    const total = intro.TOT[mode];
    let vw = window.innerWidth;
    let vh = window.innerHeight;
    let dpr = 1;
    let scale = 1;
    let ox = 0;
    let oy = 0;

    /** Canvas a pantalla completa; el motor dibuja en coordenadas lógicas y se escala a cubrir (cover). */
    const fit = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.round(vw * dpr);
      el.height = Math.round(vh * dpr);
      scale = Math.max(vw / LW, vh / LH);
      ox = (vw - LW * scale) / 2;
      oy = (vh - LH * scale) / 2;
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, ox * dpr, oy * dpr);
    };
    fit();
    window.addEventListener('resize', fit);

    // El icono del splash nativo no puede ser tan grande como la marca del canvas (Android lo recorta a un circulo): mide
    // 54 u * 1,08 * 288/108 dp. El canvas arranca a ese tamano (escala desde el centro) y crece al suyo en 380 ms, asi
    // no hay salto de tamano en el traspaso.
    const nativeDp = 54 * 1.08 * (288 / 108);
    const canvasDp = 227 * scale;
    const from = Math.min(1, nativeDp / canvasDp);
    el.style.transformOrigin = '50% 50%';
    el.style.transform = `scale(${from})`;
    const grow = window.setTimeout(() => {
      el.style.transition = 'transform 380ms cubic-bezier(.22,1,.36,1)';
      el.style.transform = 'scale(1)';
    }, 90);

    const finish = () => {
      if (done.current) return;
      done.current = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
      barsOverDark(false);
      onDone();
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
        lastFrame = now;
      }
      // Calidad: promedio de los últimos 30 fotogramas. Solo baja, nunca sube durante la intro.
      frames.push(now - lastFrame);
      lastFrame = now;
      if (frames.length > 30) frames.shift();
      if (frames.length === 30) {
        const avg = frames.reduce((a, b) => a + b, 0) / 30;
        const next: 0 | 1 | 2 = avg > VERY_SLOW_MS ? 2 : avg > SLOW_MS ? 1 : 0;
        if (next > quality) {
          quality = next;
          intro.setQuality(quality);
        }
      }

      let tm = now - t0;
      if (skipTo !== null && tm < skipTo) {
        t0 -= skipTo - tm;
        tm = skipTo;
      }
      intro.draw(ctx, tm, mode);
      const h = intro.hand(tm, mode);
      // El iris se escribe directo en el estilo del lienzo (sin re-renderizar cada fotograma).
      el.style.maskImage = h.iris > 0 ? irisMask(h.iris * scale) : '';
      el.style.webkitMaskImage = el.style.maskImage;
      if (tm >= total) return finish();
      raf = requestAnimationFrame(frame);
    };

    // Primer fotograma en el mismo instante que el splash nativo: draw(0) con el canvas ya dimensionado.
    intro.setQuality(0);
    intro.draw(ctx, 0, mode);
    raf = requestAnimationFrame(frame);

    // Tocar la pantalla salta al final (iris en 200 ms) cuando Hoy ya está listo y la intro lleva un rato.
    const tap = () => {
      if (!readyRef.current || done.current || !t0) return;
      const tm = performance.now() - t0;
      if (tm < SKIP_AFTER_MS) return;
      const endAt = total - SKIP_IRIS_MS;
      if (tm < endAt) skipTo = endAt;
    };
    el.addEventListener('pointerdown', tap);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(grow);
      window.removeEventListener('resize', fit);
      el.removeEventListener('pointerdown', tap);
      barsOverDark(false);
    };
    // La intro corre una sola vez por montaje; `ready` se lee con ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div className="m-intro" role="status" aria-label={t('mobile.splash.label')}>
      <canvas ref={canvas} className="m-intro-canvas" aria-hidden="true" />
    </div>
  );
}
