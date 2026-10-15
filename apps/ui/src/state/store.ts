import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(next: Partial<T> | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
  use<S>(selector: (s: T) => S): S;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  const store: Store<T> = {
    get: () => state,
    set(next) {
      state = typeof next === 'function' ? (next as (p: T) => T)(state) : { ...state, ...next };
      // A throwing subscriber must not starve the ones after it (a dead tab strip while the rest of the UI works).
      for (const l of [...listeners]) {
        try {
          l();
        } catch (e) {
          console.error('store listener failed', e);
        }
      }
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    use: (selector) => useSyncExternalStore(store.subscribe, () => selector(state), () => selector(state)),
  };
  return store;
}
