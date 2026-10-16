import { addPluginListener } from '@tauri-apps/api/core';
import { ipc } from './ipc';

/** Márgenes de las barras del sistema (px CSS) medidos por el plugin nativo. */
export interface Insets { top: number; bottom: number; left: number; right: number }

/** Publica los márgenes como variables CSS (`--np-inset-*`); `mobile.css` los combina con `env(safe-area-inset-*)` (el mayor gana). */
export function applyInsets(i: Partial<Insets>, root: HTMLElement = document.documentElement): void {
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    const v = i[side];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) root.style.setProperty(`--np-inset-${side}`, `${Math.round(v)}px`);
  }
}

/** Pide los márgenes al arrancar y sigue sus cambios (gesto/3 botones, giro, recorte). Sin plugin (navegador) no hace nada. */
export function initInsets(): void {
  void ipc.insets().then(applyInsets).catch(() => {});
  void addPluginListener('np-mobile', 'insets', (i: Insets) => applyInsets(i)).catch(() => {});
}
