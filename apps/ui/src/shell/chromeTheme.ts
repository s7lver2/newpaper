import { commands } from '../ipc/commands';

/**
 * Mantiene el fondo nativo (ventana y webviews de contenido) igual que el tema de la UI, para que
 * al abrir o recrear una pestaña nunca asome el blanco por defecto de WebView2.
 */
export function watchNativeBackground(root: HTMLElement = document.documentElement): () => void {
  let last = '';
  const push = () => {
    const theme = root.dataset.theme === 'ink' ? 'ink' : 'paper';
    if (theme === last) return;
    last = theme;
    try {
      commands.chromeSetTheme(theme).catch(() => {});
    } catch {
      /* sin backend (tests, navegador) */
    }
  };
  const obs = new MutationObserver(push);
  obs.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  push();
  // El fundido entre páginas respeta `prefers-reduced-motion`: Rust no lo hace si el usuario lo pide.
  const mql = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const pushMotion = () => {
    try {
      commands.chromeSetMotion(!!mql?.matches).catch(() => {});
    } catch {
      /* sin backend */
    }
  };
  pushMotion();
  mql?.addEventListener?.('change', pushMotion);
  return () => {
    obs.disconnect();
    mql?.removeEventListener?.('change', pushMotion);
  };
}
