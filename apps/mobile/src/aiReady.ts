import { useSyncExternalStore } from 'react';
import { hasProvider } from './aiReadyLogic';
import { ipc, onAiSettingsChange } from './ipc';

export { hasProvider } from './aiReadyLogic';

/** Estado compartido de «¿hay proveedor?». `null` mientras se lee; se actualiza solo cuando cambian los ajustes `ai.*`. */
let ready: boolean | null = null;
const listeners = new Set<() => void>();
let started = false;

export async function refreshAiReady(): Promise<boolean> {
  const [connected, custom] = await Promise.all([ipc.settingsGet<string[]>('ai.connected').catch(() => null), ipc.settingsGet<unknown[]>('ai.customEndpoints').catch(() => null)]);
  const next = hasProvider(connected, custom);
  if (next !== ready) {
    ready = next;
    listeners.forEach((l) => l());
  }
  return next;
}

function start() {
  if (started) return;
  started = true;
  onAiSettingsChange(() => void refreshAiReady());
  void refreshAiReady();
}

/** Estado actual (sin suscribirse), para lógica fuera de React. `null` = aún no se sabe. */
export const aiReadyNow = () => ready;

export function useAiReady(): boolean | null {
  start();
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => ready);
}
