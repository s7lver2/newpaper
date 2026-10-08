import { useEffect, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

/**
 * Counts from 0 up to `target` over 1.4 s with an ease-out quartic curve, as the stat tiles of Ajustes.dc.html
 * do when the Bloqueo section opens. The animation restarts when `target` goes from zero to a value (first data
 * arriving); later changes follow the target directly. With reduced motion it returns the target at once.
 */
export function useCountUp(target: number, duration = 1400): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  const [done, setDone] = useState(reduced);
  useEffect(() => {
    if (reduced) {
      setValue(target);
      setDone(true);
      return;
    }
    if (done) {
      setValue(target);
      return;
    }
    if (target <= 0) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - k, 4))));
      if (k < 1) raf = requestAnimationFrame(tick);
      else setDone(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, reduced, done]);
  return value;
}
