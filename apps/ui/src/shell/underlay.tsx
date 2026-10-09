import { useEffect } from 'react';
import { commands } from '../ipc/commands';
import { browserStore } from '../state/browser';
import { createStore } from '../state/store';

/**
 * La webview nativa de la página se dibuja siempre sobre la UI, así que un popover o un diálogo que se
 * abre sobre ella quedaría tapado. Mientras haya alguno abierto, Rust captura la página y la oculta, y
 * aquí se pinta la captura debajo del popover (con cuenta, por si hay varios a la vez).
 */
const store = createStore<{ image: string | null }>({ image: null });
let count = 0;
let tabId: number | null = null;
let pending: Promise<void> = Promise.resolve();

export function acquireUnderlay(): () => void {
  count += 1;
  if (count === 1) {
    const id = browserStore.get().snapshot.activeId;
    tabId = id;
    pending =
      id === null
        ? Promise.resolve()
        : commands
            .overlayOpen(id)
            .then((image) => {
              if (count > 0) store.set({ image });
            })
            .catch(() => {});
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count -= 1;
    if (count > 0) return;
    store.set({ image: null });
    const id = tabId;
    tabId = null;
    void pending.finally(() => {
      if (id !== null && count === 0) void commands.ctxClose(id).catch(() => {});
    });
  };
}

/** Mientras `open` sea verdadero, la página nativa se sustituye por su captura. */
export function useUnderlay(open: boolean): void {
  useEffect(() => (open ? acquireUnderlay() : undefined), [open]);
}

export function NativeUnderlay() {
  const image = store.use((s) => s.image);
  return image ? <img className="np-ctx-shot np-underlay" src={image} alt="" aria-hidden="true" /> : null;
}
