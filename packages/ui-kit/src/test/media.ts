type Listener = (event: MediaQueryListEvent) => void;

const state = new Map<string, boolean>();
const lists = new Map<string, { listeners: Set<Listener>; mql: MediaQueryList }>();
const norm = (q: string) => q.replace(/\s+/g, ' ').trim();

export function installMatchMedia(): void {
  window.matchMedia = (query: string): MediaQueryList => {
    const key = norm(query);
    let entry = lists.get(key);
    if (!entry) {
      const listeners = new Set<Listener>();
      const mql = {
        get matches() {
          return state.get(key) ?? false;
        },
        media: query,
        onchange: null,
        addEventListener: (_t: string, l: Listener) => listeners.add(l),
        removeEventListener: (_t: string, l: Listener) => listeners.delete(l),
        addListener: (l: Listener) => listeners.add(l),
        removeListener: (l: Listener) => listeners.delete(l),
        dispatchEvent: () => true,
      } as unknown as MediaQueryList;
      entry = { listeners, mql };
      lists.set(key, entry);
    }
    return entry.mql;
  };
}

export function setMediaQuery(query: string, matches: boolean): void {
  const key = norm(query);
  state.set(key, matches);
  lists.get(key)?.listeners.forEach((l) => l({ matches, media: query } as MediaQueryListEvent));
}

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
export const DARK_QUERY = '(prefers-color-scheme: dark)';

export function setReducedMotion(value: boolean): void {
  setMediaQuery(REDUCED_MOTION_QUERY, value);
}