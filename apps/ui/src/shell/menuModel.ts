/** Lógica pura del menú contextual propio: qué entradas salen según el contexto. */

export interface MenuContext {
  /** `tab`: clic derecho en una página web; `ui`: en la propia interfaz. */
  source: 'tab' | 'ui';
  kind: 'page' | 'image' | 'selection' | 'audio' | 'video';
  link: string | null;
  imageSrc: string | null;
  selection: string | null;
  editable: boolean;
  pageUrl: string;
  canBack: boolean;
  canForward: boolean;
  /** Hay lector (o selector de artículos) para esta página. */
  readable: boolean;
  readerOpen: boolean;
}

export type MenuActionId =
  | 'openTab' | 'openReader' | 'copyLink'
  | 'openImage' | 'copyImageUrl'
  | 'copy' | 'cut' | 'paste' | 'selectAll' | 'search'
  | 'back' | 'forward' | 'reload' | 'toggleReader' | 'copyPageUrl';

export interface MenuItem {
  id: MenuActionId;
  /** Clave i18n (`shell.menu.<key>`). */
  key: string;
  params?: Record<string, string>;
  disabled?: boolean;
}

/** Grupos de entradas; la UI pinta un separador entre grupos. */
export type MenuGroups = MenuItem[][];

const short = (s: string, n = 28) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export function buildMenu(c: MenuContext): MenuGroups {
  const hasSelection = !!c.selection;
  if (c.editable) {
    return [[
      { id: 'cut', key: 'cut', disabled: !hasSelection },
      { id: 'copy', key: 'copy', disabled: !hasSelection },
      { id: 'paste', key: 'paste' },
      { id: 'selectAll', key: 'selectAll' },
    ]];
  }
  const groups: MenuGroups = [];
  if (c.link) {
    groups.push([
      { id: 'openTab', key: 'openTab' },
      { id: 'openReader', key: 'openReader' },
      { id: 'copyLink', key: 'copyLink' },
    ]);
  }
  if (c.kind === 'image' && c.imageSrc) {
    groups.push([
      { id: 'openImage', key: 'openImage' },
      { id: 'copyImageUrl', key: 'copyImageUrl' },
    ]);
  }
  if (hasSelection) {
    groups.push([
      { id: 'copy', key: 'copy' },
      { id: 'search', key: 'search', params: { text: short(c.selection!) } },
    ]);
  }
  if (c.source === 'tab' && !c.link && !hasSelection && c.kind !== 'image') {
    const page: MenuItem[] = [
      { id: 'back', key: 'back', disabled: !c.canBack },
      { id: 'forward', key: 'forward', disabled: !c.canForward },
      { id: 'reload', key: 'reload' },
    ];
    groups.push(page);
    const more: MenuItem[] = [];
    if (c.readable) more.push({ id: 'toggleReader', key: c.readerOpen ? 'viewOriginal' : 'viewReader' });
    more.push({ id: 'copyPageUrl', key: 'copyPageUrl' });
    groups.push(more);
  }
  // Sin selección, enlace ni edición, la propia interfaz no muestra menú.
  return groups;
}

/** Posición del menú dentro del área visible (con margen de 8 px). */
export function clampMenu(x: number, y: number, w: number, h: number, vw: number, vh: number): { left: number; top: number } {
  const margin = 8;
  const left = x + w + margin > vw ? Math.max(margin, vw - w - margin) : x;
  const top = y + h + margin > vh ? Math.max(margin, vh - h - margin) : y;
  return { left, top };
}
