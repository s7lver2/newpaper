import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { DARK_QUERY, installMatchMedia, setMediaQuery, setReducedMotion } from './media';

// Los tests de node (p. ej. lectura de CSS) no tienen window: no hay DOM que preparar.
if (typeof window !== 'undefined') {
  installMatchMedia();
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function scrollIntoView() {};
  if (!('ResizeObserver' in window)) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
}

// Por defecto los tests ven los valores finales (sin animación) y el tema claro.
beforeEach(() => {
  setReducedMotion(true);
  setMediaQuery(DARK_QUERY, false);
});
afterEach(() => cleanup());
