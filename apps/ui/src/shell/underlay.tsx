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
// La página sigue oculta unos instantes tras soltar el último popover: si otro diálogo se abre justo después (primer
// arranque seguido del recorrido), reutiliza la captura en lugar de capturar una página ya oculta (saldría en blanco).
let keptImage: string | null = null;
let hiddenId: number | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
const CLOSE_DELAY_MS = 150;

export function acquireUnderlay(): () => void {
  count += 1;
  if (count === 1) {
    if (closeTimer !== null) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    const id = browserStore.get().snapshot.activeId;
    tabId = id;
    if (id !== null && hiddenId === id && keptImage !== null) {
      store.set({ image: keptImage });
      pending = Promise.resolve();
    } else {
      pending =
        id === null
          ? Promise.resolve()
          : commands
              .overlayOpen(id)
              .then((image) => {
                if (count > 0) {
                  keptImage = image;
                  hiddenId = image === null ? null : id;
                  store.set({ image });
                }
              })
              .catch(() => {});
    }
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
    closeTimer = setTimeout(() => {
      closeTimer = null;
      void pending.finally(() => {
        if (id !== null && count === 0) {
          hiddenId = null;
          keptImage = null;
          void commands.ctxClose(id).catch(() => {});
        }
      });
    }, CLOSE_DELAY_MS);
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
