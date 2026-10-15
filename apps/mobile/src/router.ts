import { useSyncExternalStore } from 'react';

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
  | 'sin-conexion';
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
