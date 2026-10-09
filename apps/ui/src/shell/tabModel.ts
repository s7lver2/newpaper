import type { TabGroup, TabInfo } from '../ipc/types';

/** Un bloque de la tira de pestañas: ancladas, un grupo (con sus pestañas) o pestañas sueltas. */
export type TabSegment =
  | { kind: 'pinned'; tabs: TabInfo[] }
  | { kind: 'group'; group: TabGroup; tabs: TabInfo[] }
  | { kind: 'loose'; tabs: TabInfo[] };

/**
 * Ordena las pestañas (ya en el orden de Rust) en bloques consecutivos. Un grupo plegado conserva su
 * lista de pestañas para contarlas, pero la tira solo dibuja el rótulo.
 */
export function segments(tabs: TabInfo[], groups: TabGroup[]): TabSegment[] {
  const out: TabSegment[] = [];
  const byId = new Map(groups.map((g) => [g.id, g]));
  for (const tab of tabs) {
    const last = out[out.length - 1];
    if (tab.pinned) {
      if (last?.kind === 'pinned') last.tabs.push(tab);
      else out.push({ kind: 'pinned', tabs: [tab] });
      continue;
    }
    const g = tab.group != null ? byId.get(tab.group) : undefined;
    if (g) {
      if (last?.kind === 'group' && last.group.id === g.id) last.tabs.push(tab);
      else out.push({ kind: 'group', group: g, tabs: [tab] });
    } else if (last?.kind === 'loose') last.tabs.push(tab);
    else out.push({ kind: 'loose', tabs: [tab] });
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Filtro de la lista de pestañas: título o dirección contienen el texto (sin tildes ni mayúsculas). */
export function filterTabs(tabs: TabInfo[], query: string): TabInfo[] {
  const q = norm(query.trim());
  if (!q) return tabs;
  return tabs.filter((t) => norm(`${t.title} ${t.url}`).includes(q));
}

export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
};

/** Inicial para una pestaña anclada (solo icono): primera letra del título o del sitio. */
export const glyphOf = (tab: TabInfo): string => (tab.title || hostOf(tab.url) || '·').trim().charAt(0).toUpperCase();
