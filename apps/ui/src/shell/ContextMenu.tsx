import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@newpaper/i18n/react';
import { commands } from '../ipc/commands';
import { onContextMenu, type ContextMenuEvent } from '../ipc/events';
import { browserStore } from '../state/browser';
import { buildMenu, clampMenu, type MenuActionId, type MenuContext, type MenuItem } from './menuModel';
import { RENAME_GROUP_EVENT } from './TabStrip';
import { navigate } from './navigate';

interface Open {
  ctx: MenuContext;
  /** Posición en coordenadas de la ventana. */
  x: number;
  y: number;
  tabId: number | null;
  image: string | null;
  /** Elemento de la UI que tenía el foco (para devolvérselo). */
  returnTo: HTMLElement | null;
}

/** Copia texto sin pedir el permiso de portapapeles del navegador (hay un gesto del usuario). */
function copyText(text: string): void {
  const prev = document.activeElement as HTMLElement | null;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('aria-hidden', 'true');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.append(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
  prev?.focus?.();
}

const absolute = (href: string, base: string): string => {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
};

/** Abre una URL en pestaña nueva y, cuando la página esté lista, en el lector. */
async function openInReader(url: string): Promise<void> {
  const tab = await commands.tabOpen({ url });
  const stop = browserStore.subscribe(() => {
    const s = browserStore.get();
    const t = s.snapshot.tabs.find((x) => x.id === tab.id);
    if (!t) return stop();
    if (t.readable) {
      stop();
      if (t.view !== 'reader') void commands.tabSetView(tab.id, 'reader');
    }
  });
  window.setTimeout(stop, 20000);
}

/** Estado de edición de un elemento de la propia interfaz bajo el cursor. */
function uiContext(e: MouseEvent): MenuContext | null {
  const target = e.target as HTMLElement | null;
  const snap = browserStore.get().snapshot;
  const blank = { source: 'ui', kind: 'page', link: null, imageSrc: null, selection: null, editable: false, pageUrl: '', canBack: false, canForward: false, readable: false, readerOpen: false } as const;
  const tabEl = target?.closest?.('[data-tab-id]') as HTMLElement | null;
  if (tabEl) {
    const tab = snap.tabs.find((x) => x.id === Number(tabEl.dataset.tabId));
    if (tab) return { ...blank, target: { type: 'tab', id: tab.id, pinned: !!tab.pinned, group: tab.group ?? null, groups: (snap.groups ?? []).map((g) => ({ id: g.id, name: g.name })) } };
  }
  const groupEl = target?.closest?.('[data-group-id]') as HTMLElement | null;
  if (groupEl) {
    const g = (snap.groups ?? []).find((x) => x.id === Number(groupEl.dataset.groupId));
    if (g) return { ...blank, target: { type: 'group', id: g.id, collapsed: g.collapsed, color: g.color } };
  }
  const el = target?.closest?.('input, textarea, [contenteditable="true"]') as HTMLInputElement | null;
  const sel = window.getSelection()?.toString() ?? '';
  const editable = !!el && !el.readOnly && !el.disabled && !(el instanceof HTMLInputElement && ['checkbox', 'radio', 'button', 'range'].includes(el.type));
  const inputSel = el && typeof el.selectionStart === 'number' && el.selectionStart !== el.selectionEnd ? el.value.slice(el.selectionStart!, el.selectionEnd!) : '';
  const selection = inputSel || sel || null;
  if (!editable && !selection) return null;
  return { source: 'ui', kind: 'page', link: null, imageSrc: null, selection, editable, pageUrl: '', canBack: false, canForward: false, readable: false, readerOpen: false };
}

async function runTargetAction(id: MenuActionId, target: NonNullable<MenuContext['target']>): Promise<void> {
  if (target.type === 'group') {
    const gid = target.id;
    if (id === 'renameGroup') window.dispatchEvent(new CustomEvent(RENAME_GROUP_EVENT, { detail: gid }));
    else if (id === 'toggleGroup') await commands.tabGroupUpdate(gid, { collapsed: !target.collapsed });
    else if (id.startsWith('color:')) await commands.tabGroupUpdate(gid, { color: id.slice(6) });
    else if (id === 'ungroupAll') {
      for (const t of browserStore.get().snapshot.tabs.filter((x) => x.group === gid)) await commands.tabUngroup(t.id);
    } else if (id === 'closeGroup') await commands.tabCloseGroup(gid);
    return;
  }
  const tid = target.id;
  if (id === 'pin' || id === 'unpin') await commands.tabPin(tid, id === 'pin');
  else if (id === 'newGroup') await commands.tabGroup([tid]);
  else if (id === 'ungroup') await commands.tabUngroup(tid);
  else if (id === 'closeTab') await commands.tabClose(tid);
  else if (id.startsWith('addToGroup:')) await commands.tabGroup([tid], { groupId: Number(id.slice(11)) });
}

export function ContextMenuHost() {
  const { t } = useI18n();
  const [open, setOpen] = useState<Open | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const openRef = useRef<Open | null>(null);
  openRef.current = open;

  const close = useCallback((restore = true) => {
    const o = openRef.current;
    if (!o) return;
    setOpen(null);
    setPos(null);
    if (o.tabId !== null && restore) void commands.ctxClose(o.tabId);
    else o.returnTo?.focus?.();
  }, []);

  // Menú de una página web (Rust: ContextMenuRequested; la webview se oculta y llega una captura).
  useEffect(() => {
    const off = onContextMenu((e: ContextMenuEvent) => {
      const snap = browserStore.get().snapshot;
      const tab = snap.tabs.find((x) => x.id === e.tabId);
      const rect = anchor.current?.parentElement?.getBoundingClientRect();
      const ctx: MenuContext = {
        source: 'tab',
        kind: e.kind,
        link: e.link ? absolute(e.link, e.pageUrl) : null,
        imageSrc: e.source ?? null,
        selection: e.selection ?? null,
        editable: e.editable,
        pageUrl: e.pageUrl || tab?.url || '',
        canBack: !!tab?.canGoBack,
        canForward: !!tab?.canGoForward,
        readable: !!tab?.readable,
        readerOpen: tab?.view === 'reader',
      };
      setOpen({ ctx, x: (rect?.left ?? 0) + e.x, y: (rect?.top ?? 0) + e.y, tabId: e.tabId, image: e.image, returnTo: null });
    });
    return () => void off.then((f) => f());
  }, []);

  // Menú de la propia interfaz: campos de texto y selecciones (el nativo está desactivado).
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('.np-ctx')) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const ctx = uiContext(e);
      if (!ctx || !buildMenu(ctx).length) return;
      const el = document.activeElement as HTMLElement | null;
      let { clientX: x, clientY: y } = e;
      if (x === 0 && y === 0 && e.target instanceof HTMLElement) {
        // Tecla de menú / Mayús+F10: junto al elemento.
        const r = e.target.getBoundingClientRect();
        x = r.left + 12;
        y = r.bottom;
      }
      setOpen({ ctx, x, y, tabId: null, image: null, returnTo: el });
    };
    window.addEventListener('contextmenu', onCtx);
    return () => window.removeEventListener('contextmenu', onCtx);
  }, []);

  // Cierre: pestaña activa distinta, cambio de tamaño o pérdida de foco de la ventana.
  useEffect(() => {
    if (!open) return;
    const stop = () => close();
    window.addEventListener('resize', stop);
    window.addEventListener('blur', stop);
    const unsub = browserStore.subscribe(() => {
      const o = openRef.current;
      if (o?.tabId != null && browserStore.get().snapshot.activeId !== o.tabId) {
        // otra pestaña activa: Rust ya limpió el estado; solo se cierra la UI
        setOpen(null);
        setPos(null);
      }
    });
    return () => {
      window.removeEventListener('resize', stop);
      window.removeEventListener('blur', stop);
      unsub();
    };
  }, [open, close]);

  const groups = open ? buildMenu(open.ctx) : [];

  useLayoutEffect(() => {
    if (!open || !menuRef.current) return;
    const r = menuRef.current.getBoundingClientRect();
    setPos(clampMenu(open.x, open.y, r.width, r.height, window.innerWidth, window.innerHeight));
    menuRef.current.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [open]);

  const run = async (item: MenuItem) => {
    const o = open;
    if (!o || item.disabled) return;
    const { ctx, tabId } = o;
    const sel = ctx.selection ?? '';
    const id: MenuActionId = item.id;
    if (ctx.target) {
      await runTargetAction(id, ctx.target);
      return;
    }
    // El menú se cierra antes de actuar: la webview vuelve a la vista y recupera el foco.
    close(true);
    const active = browserStore.get().snapshot.activeId;
    const target = tabId ?? active;
    switch (id) {
      case 'openTab': if (ctx.link) await navigate(ctx.link, { newTab: true }); break;
      case 'openReader': if (ctx.link) await openInReader(ctx.link); break;
      case 'copyLink': if (ctx.link) copyText(ctx.link); break;
      case 'openImage': if (ctx.imageSrc) await navigate(ctx.imageSrc, { newTab: true }); break;
      case 'copyImageUrl': if (ctx.imageSrc) copyText(ctx.imageSrc); break;
      case 'copyPageUrl': copyText(ctx.pageUrl); break;
      case 'search': await navigate(sel, { newTab: true }); break;
      case 'back': if (target !== null) await commands.tabBack(target); break;
      case 'forward': if (target !== null) await commands.tabForward(target); break;
      case 'reload': if (target !== null) await commands.tabReload(target); break;
      case 'toggleReader': if (target !== null) await commands.tabSetView(target, ctx.readerOpen ? 'original' : 'reader'); break;
      case 'copy':
        if (ctx.source === 'ui') {
          o.returnTo?.focus?.();
          document.execCommand('copy');
        } else copyText(sel);
        break;
      case 'cut':
        if (ctx.source === 'ui') {
          o.returnTo?.focus?.();
          document.execCommand('cut');
        } else {
          copyText(sel);
          if (tabId !== null) await commands.ctxEdit(tabId, 'delete');
        }
        break;
      case 'paste': {
        const text = (await commands.clipboardText()) ?? '';
        if (ctx.source === 'ui') {
          o.returnTo?.focus?.();
          document.execCommand('insertText', false, text);
        } else if (tabId !== null) await commands.ctxEdit(tabId, 'paste', text);
        break;
      }
      case 'selectAll':
        if (ctx.source === 'ui') {
          o.returnTo?.focus?.();
          document.execCommand('selectAll');
        } else if (tabId !== null) await commands.ctxEdit(tabId, 'selectAll');
        break;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const go = (n: number) => {
      e.preventDefault();
      items[(n + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault();
      close();
    }
  };

  return (
    <>
      <span ref={anchor} className="np-ctx-anchor" aria-hidden="true" />
      {open?.image ? <img className="np-ctx-shot" src={open.image} alt="" aria-hidden="true" /> : null}
      {open
        ? createPortal(
            <div className="np-ctx-layer" onPointerDown={(e) => e.target === e.currentTarget && close()} onContextMenu={(e) => { e.preventDefault(); if (e.target === e.currentTarget) close(); }}>
              <div
                ref={menuRef}
                className="np-ctx np-pop"
                role="menu"
                aria-label={t('shell.menu.label')}
                style={{ left: pos?.left ?? open.x, top: pos?.top ?? open.y, visibility: pos ? 'visible' : 'hidden' }}
                onKeyDown={onKeyDown}
              >
                {groups.map((g, gi) => (
                  <div role="group" className="np-ctx-group" key={gi}>
                    {g.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitem"
                        className="np-ctx-item"
                        aria-disabled={item.disabled ? 'true' : undefined}
                        tabIndex={-1}
                        onClick={() => void run(item)}
                      >
                        {t(`shell.menu.${item.key}`, item.params)}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
