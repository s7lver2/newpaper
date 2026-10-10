import { commands } from '../../ipc/commands';

export type QueuedAction = { kind: 'watch'; args: { articleUrl?: string; query?: string; eventId?: number } } | { kind: 'analyzeUrl'; url: string };
const KEY = 'device.offlineQueue';

export async function enqueue(a: QueuedAction): Promise<void> {
  const q = (await commands.settingsGet<QueuedAction[]>(KEY)) ?? [];
  await commands.settingsSet(KEY, [...q, a]);
}

/** Ejecuta lo pendiente; lo que vuelve a fallar se queda en la cola. */
export async function flush(): Promise<number> {
  const stored = await commands.settingsGet<QueuedAction[]>(KEY).catch(() => undefined);
  if (stored === undefined) return 0; // sin leer la cola no se reescribe
  const q = stored ?? [];
  const left: QueuedAction[] = [];
  for (const a of q) {
    try {
      if (a.kind === 'watch') await commands.watchAdd(a.args);
      else await commands.tabOpen({ url: a.url, activate: false });
    } catch {
      left.push(a);
    }
  }
  await commands.settingsSet(KEY, left);
  return q.length - left.length;
}

export function startOfflineQueue(): void {
  window.addEventListener('online', () => void flush().catch(() => {}));
  if (navigator.onLine) void flush().catch(() => {});
}
