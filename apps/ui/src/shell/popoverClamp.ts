import { useLayoutEffect, type RefObject } from 'react';

/** Desplazamiento horizontal que mete `[left, left + width]` en `[margin, vw - margin]` (si cabe). */
export function clampShift(left: number, width: number, vw: number, margin = 8): number {
  let dx = 0;
  if (left + width > vw - margin) dx = vw - margin - (left + width);
  if (left + dx < margin) dx = margin - left;
  return dx;
}

/**
 * Mantiene un popover anclado (`position: absolute`) dentro de la ventana: mide su posición de
 * maquetación (sin transformaciones de la animación) y lo desplaza con `translate` si se sale por
 * la izquierda o la derecha. Se recalcula al cambiar el tamaño de la ventana.
 */
export function useViewportClamp(ref: RefObject<HTMLElement | null>, active = true, margin = 8): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const apply = () => {
      const parent = el.offsetParent as HTMLElement | null;
      const base = parent ? parent.getBoundingClientRect().left : 0;
      const dx = clampShift(base + el.offsetLeft, el.offsetWidth, document.documentElement.clientWidth, margin);
      el.style.translate = dx ? `${Math.round(dx)}px 0` : '';
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [ref, active, margin]);
}
