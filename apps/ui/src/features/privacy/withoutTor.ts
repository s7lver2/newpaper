import { createStore } from '../../state/store';

/** Cualquier parte de la UI (popup de Tor, página "Tor bloqueado" del subproyecto 6) pide el aviso aquí. */
export const withoutTorStore = createStore<{ pendingTabId: number | null }>({ pendingTabId: null });
export const requestOpenWithoutTor = (tabId: number) => withoutTorStore.set({ pendingTabId: tabId });
export const cancelOpenWithoutTor = () => withoutTorStore.set({ pendingTabId: null });
