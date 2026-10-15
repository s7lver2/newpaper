import { useSyncExternalStore } from 'react';

export type RouteName = 'bienvenida' | 'hoy' | 'leer' | 'agente' | 'ajustes' | 'proveedor' | 'emparejar' | 'historial' | 'edicion' | 'sin-conexion';
export interface Route { name: RouteName; params: URLSearchParams }

function parse(): Route {
  const [path = '', query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const name = (path || 'hoy') as RouteName;
  return { name, params: new URLSearchParams(query) };
}

let current = parse();
const listeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse();
  listeners.forEach((l) => l());
});

export const useRoute = () => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => current);

/** Navega con hash: el botón Atrás de Android vuelve por el historial de la webview. */
export function go(name: RouteName, params: Record<string, string> = {}): void {
  const q = new URLSearchParams(params).toString();
  location.hash = `/${name}${q ? `?${q}` : ''}`;
}
