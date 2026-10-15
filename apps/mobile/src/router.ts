import { useEffect, useRef, useSyncExternalStore } from 'react';

export type RouteName =
  | 'bienvenida'
  | 'hoy'
  | 'leer'
  | 'agente'
  | 'ajustes'
  | 'proveedor'
  | 'emparejar'
  | 'historial'
  | 'edicion'
  | 'sin-conexion'
  | 'pipeline'
  | 'bloqueo'
  | 'fuentes';
export interface Route { name: RouteName; params: URLSearchParams }
/** Cómo se llegó a la pantalla: decide la animación (push desde la derecha, pop hacia la derecha, pestaña = fundido). */
export type NavDir = 'push' | 'pop' | 'tab';

/** Raíces de la barra de pestañas. Sus pantallas se mantienen montadas para conservar el scroll. */
export const TAB_ROOTS = ['hoy', 'leer', 'agente', 'ajustes'] as const;
export type TabRoot = (typeof TAB_ROOTS)[number];

function parse(): Route {
  const [path = '', query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const name = (path || 'hoy') as RouteName;
  return { name, params: new URLSearchParams(query) };
}

let current = parse();
let dir: NavDir = 'tab';
let pending: NavDir | null = null;
const listeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse();
  // Sin `go()` detrás del cambio de hash es el botón Atrás (del sistema o de la app): vuelve atrás.
  dir = pending ?? 'pop';
  pending = null;
  listeners.forEach((l) => l());
});

export const useRoute = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => current);
export const useNavDir = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => dir);

/** Navega con hash: el botón Atrás de Android vuelve por el historial de la webview. */
export function go(name: RouteName, params: Record<string, string> = {}): void {
  const q = new URLSearchParams(params).toString();
  const isTab = (TAB_ROOTS as readonly string[]).includes(name) && !q;
  pending = isTab ? 'tab' : 'push';
  location.hash = `/${name}${q ? `?${q}` : ''}`;
}

/** Volver a la pantalla anterior (equivale al gesto atrás). */
export function back(): void {
  pending = 'pop';
  history.back();
}

/**
 * Capas (hojas, escáner, confirmaciones): mientras están abiertas hay una entrada de historial propia, así que el
 * gesto o botón Atrás de Android las cierra en vez de salir de la pantalla. Devuelve `dismiss`, que cierra por la
 * misma vía (y ejecuta `after` ya cerrada, p. ej. para navegar).
 */
export function useBackClose(open: boolean, onClose: () => void): (after?: () => void) => void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const afterRef = useRef<(() => void) | undefined>(undefined);
  const live = useRef(false);
  useEffect(() => {
    if (!open) return;
    history.pushState({ npLayer: true }, '');
    live.current = true;
    const onPop = () => {
      live.current = false;
      closeRef.current();
      const a = afterRef.current;
      afterRef.current = undefined;
      a?.();
    };
    window.addEventListener('popstate', onPop, { once: true });
    return () => {
      window.removeEventListener('popstate', onPop);
      // Cerrada sin pasar por Atrás (p. ej. se desmontó la pantalla): quitar nuestra entrada.
      if (live.current) {
        live.current = false;
        if ((history.state as { npLayer?: boolean } | null)?.npLayer) history.back();
      }
    };
  }, [open]);
  return (after) => {
    if (live.current) {
      afterRef.current = after;
      history.back();
    } else {
      closeRef.current();
      after?.();
    }
  };
}
