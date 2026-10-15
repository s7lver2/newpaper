import { useEffect, useRef, useState, type RefObject } from 'react';

const ARM = 72;
const MAX = 120;

/**
 * Tirar para actualizar: solo cuando la página (el `.m-page` que contiene el elemento) está arriba del todo y el
 * gesto empieza hacia abajo. Resistencia 0,5; al soltar pasado el umbral llama a `onRefresh`.
 */
export function usePullRefresh(el: RefObject<HTMLElement | null>, onRefresh: () => Promise<void> | void) {
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<'idle' | 'pulling' | 'armed' | 'refreshing'>('idle');
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  useEffect(() => {
    const node = el.current;
    const page = node?.closest('.m-page') as HTMLElement | null;
    if (!node || !page) return;
    let y0 = 0;
    let x0 = 0;
    let active = false;
    let busy = false;
    let dy = 0;
    const start = (e: TouchEvent) => {
      if (busy || page.scrollTop > 0 || e.touches.length !== 1) return;
      y0 = e.touches[0]!.clientY;
      x0 = e.touches[0]!.clientX;
      active = true;
      dy = 0;
    };
    const move = (e: TouchEvent) => {
      if (!active) return;
      const t = e.touches[0]!;
      const d = t.clientY - y0;
      if (page.scrollTop > 0 || d <= 0 || Math.abs(t.clientX - x0) > Math.abs(d)) {
        if (dy > 0) {
          dy = 0;
          setOffset(0);
          setState('idle');
        }
        return;
      }
      dy = Math.min(MAX, d * 0.5);
      setOffset(dy);
      setState(dy >= ARM * 0.5 + 8 ? 'armed' : 'pulling');
    };
    const end = () => {
      if (!active) return;
      active = false;
      if (dy >= ARM * 0.5 + 8) {
        busy = true;
        setState('refreshing');
        setOffset(48);
        void Promise.resolve(cb.current()).finally(() => {
          busy = false;
          setOffset(0);
          setState('idle');
        });
      } else {
        setOffset(0);
        setState('idle');
      }
    };
    page.addEventListener('touchstart', start, { passive: true });
    page.addEventListener('touchmove', move, { passive: true });
    page.addEventListener('touchend', end);
    page.addEventListener('touchcancel', end);
    return () => {
      page.removeEventListener('touchstart', start);
      page.removeEventListener('touchmove', move);
      page.removeEventListener('touchend', end);
      page.removeEventListener('touchcancel', end);
    };
  }, [el]);
  return { offset, state };
}
