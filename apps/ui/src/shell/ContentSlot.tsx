import { useLayoutEffect, useRef } from 'react';
import { commands } from '../ipc/commands';
import type { Rect } from '../ipc/types';

export function measureSlot(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
}

/** Hueco transparente donde Rust coloca la webview de contenido de la pestaña activa. */
export function ContentSlot() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = '';
    const push = () => {
      const rect = measureSlot(el);
      const key = JSON.stringify(rect);
      if (key !== last) {
        last = key;
        void commands.tabSetBounds(rect);
      }
    };
    push();
    const ro = new ResizeObserver(push);
    ro.observe(el);
    window.addEventListener('resize', push);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', push);
    };
  }, []);
  return <div ref={ref} className="np-content-slot" aria-hidden="true" />;
}
