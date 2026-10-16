import { useEffect, useRef, useState } from 'react';

/** Valor intermedio de un contador que sube de `from` a `to` con salida suave (k de 0 a 1). Siempre entero. */
export function countAt(from: number, to: number, k: number): number {
  const c = Math.min(1, Math.max(0, k));
  return Math.round(from + (to - from) * (1 - Math.pow(1 - c, 4)));
}

/** Número que sube hasta `target` al montarse y cada vez que cambia. Con movimiento reducido salta directo. */
export function useCountUp(target: number, durationMs = 900): number {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const reduce = document.documentElement.dataset.motion === 'reduce' || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (reduce || from.current === target) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = (now - t0) / durationMs;
      const v = countAt(start, target, k);
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return shown;
}
