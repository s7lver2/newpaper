import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useT } from '@newpaper/i18n/react';
import { IconButton } from '@newpaper/ui-kit';
import { commands } from '../ipc/commands';
import type { TabGroup, TabInfo } from '../ipc/types';
import { useBrowser } from '../state/browser';
import { IconClose, IconList } from './icons';
import { useUnderlay } from './underlay';
import { filterTabs, glyphOf, hostOf, segments } from './tabModel';

/** Evento que el menú contextual de la tira envía para renombrar un grupo en su rótulo. */
export const RENAME_GROUP_EVENT = 'np-rename-group';

const groupColor = (g: TabGroup): CSSProperties => ({ '--g': `var(--np-group-${g.color})` }) as CSSProperties;

function TabItem({ tab, active, group }: { tab: TabInfo; active: boolean; group?: TabGroup }) {
  const t = useT();
  const title = tab.title || t('shell.tabs.untitled');
  return (
    <div
      className="np-tabstrip-item"
      data-active={active}
      data-pinned={tab.pinned ? 'true' : undefined}
      data-tab-id={tab.id}
      style={group ? groupColor(group) : undefined}
      data-grouped={group ? 'true' : undefined}
    >
      <button
        type="button"
        role="tab"
        aria-selected={active}
        aria-label={tab.pinned ? title : undefined}
        title={tab.pinned ? title : undefined}
        className="np-tabstrip-tab"
        onClick={() => commands.tabActivate(tab.id)}
      >
        {tab.pinned ? (
          <span className="np-tab-glyph" aria-hidden="true">{glyphOf(tab)}</span>
        ) : (
          <>
            <span className={tab.loading ? 'np-pulse np-tab-dot' : 'np-tab-dot'} data-loading={tab.loading} {...(tab.loading ? { role: 'img', 'aria-label': t('shell.tabs.loading') } : { 'aria-hidden': true })} />
            <span className="np-tabstrip-title">{title}</span>
            {tab.private ? <span className="np-tab-private">{t('shell.tabs.private')}</span> : null}
          </>
        )}
      </button>
      {tab.pinned ? (
        tab.loading ? <span className="np-tab-pin-dot np-pulse" aria-hidden="true" /> : null
      ) : (
        <IconButton label={t('shell.tabs.close', { title })} icon={<IconClose />} className="np-tabstrip-close np-hit np-press-spring" onClick={() => commands.tabClose(tab.id)} />
      )}
    </div>
  );
}

function GroupChip({ group, count, renaming, onRenamed }: { group: TabGroup; count: number; renaming: boolean; onRenamed: () => void }) {
  const t = useT();
  const [name, setName] = useState(group.name);
  useEffect(() => setName(group.name), [group.name, renaming]);
  if (renaming) {
    const done = (save: boolean) => {
      if (save && name.trim() && name.trim() !== group.name) void commands.tabGroupUpdate(group.id, { name: name.trim() });
      onRenamed();
    };
    return (
      <input
        className="np-group-input"
        style={groupColor(group)}
        autoFocus
        value={name}
        maxLength={40}
        aria-label={t('shell.tabs.groupName')}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => done(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') done(true);
          if (e.key === 'Escape') done(false);
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className="np-group-chip np-hit np-press-spring"
      style={groupColor(group)}
      data-group-id={group.id}
      aria-expanded={!group.collapsed}
      title={group.collapsed ? t('shell.tabs.groupExpand', { name: group.name }) : t('shell.tabs.groupCollapse', { name: group.name })}
      onClick={() => void commands.tabGroupUpdate(group.id, { collapsed: !group.collapsed })}
    >
      <span className="np-group-dot" aria-hidden="true" />
      <span className="np-group-name">{group.name}</span>
      {group.collapsed ? <span className="np-group-count" aria-label={t('shell.tabs.groupCount', { count })}>{count}</span> : null}
    </button>
  );
}

/** Lista de todas las pestañas con buscador: la salida para cuando la tira se queda corta. */
function TabList({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { tabs, activeId, groups = [] } = useBrowser((s) => s.snapshot);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => filterTabs(tabs, q), [tabs, q]);
  const segs = useMemo(() => segments(shown, groups), [shown, groups]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.np-tablist-toggle')) onClose();
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [onClose]);

  const pick = (id: number) => {
    void commands.tabActivate(id);
    onClose();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('input, .np-tablist-row') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(items.length - 1, i + 1)]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[Math.max(0, i - 1)]?.focus(); }
    if (e.key === 'Enter' && document.activeElement instanceof HTMLInputElement && shown[0]) pick(shown[0].id);
  };

  return (
    <div ref={ref} role="dialog" aria-label={t('shell.tabs.list')} className="np-popover np-tablist" onKeyDown={onKey}>
      <input
        type="search"
        autoFocus
        className="np-tablist-search"
        placeholder={t('shell.tabs.listSearch')}
        aria-label={t('shell.tabs.listSearch')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="np-tablist-body">
        {shown.length === 0 ? <p className="np-tablist-empty" role="status">{t('shell.tabs.listEmpty')}</p> : null}
        {segs.map((s, i) => (
          <div key={i} className="np-tablist-seg" style={s.kind === 'group' ? groupColor(s.group) : undefined}>
            {s.kind === 'group' ? <div className="np-tablist-head"><span className="np-group-dot" aria-hidden="true" />{s.group.name}</div> : null}
            {s.kind === 'pinned' ? <div className="np-tablist-head">{t('shell.tabs.pinned')}</div> : null}
            {s.tabs.map((tab) => (
              <div key={tab.id} className="np-tablist-line" data-active={tab.id === activeId}>
                <button type="button" className="np-tablist-row" onClick={() => pick(tab.id)} aria-current={tab.id === activeId ? 'true' : undefined}>
                  <span className="np-tablist-title">{tab.title || t('shell.tabs.untitled')}</span>
                  <span className="np-tablist-host">{hostOf(tab.url)}</span>
                </button>
                <IconButton label={t('shell.tabs.close', { title: tab.title || t('shell.tabs.untitled') })} icon={<IconClose />} className="np-tablist-close" onClick={() => commands.tabClose(tab.id)} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TabStrip() {
  const t = useT();
  const { tabs, activeId, groups = [] } = useBrowser((s) => s.snapshot);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [listOpen, setListOpen] = useState(false);
  useUnderlay(listOpen);
  const segs = useMemo(() => segments(tabs, groups), [tabs, groups]);
  const listRef = useRef<HTMLDivElement>(null);

  // La pestaña activa siempre queda a la vista aunque la tira desborde.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
  }, [activeId, tabs.length]);

  useEffect(() => {
    const on = (e: Event) => setRenaming((e as CustomEvent<number>).detail);
    window.addEventListener(RENAME_GROUP_EVENT, on);
    return () => window.removeEventListener(RENAME_GROUP_EVENT, on);
  }, []);

  return (
    <div className="np-tabstrip">
      <div role="tablist" aria-label={t('shell.tabs.label')} className="np-tabstrip-list" ref={listRef}>
        {segs.map((s, i) => {
          if (s.kind === 'group') {
            return (
              <div key={`g${s.group.id}`} className="np-group" role="group" aria-label={s.group.name} data-collapsed={s.group.collapsed}>
                <GroupChip group={s.group} count={s.tabs.length} renaming={renaming === s.group.id} onRenamed={() => setRenaming(null)} />
                {s.group.collapsed ? null : s.tabs.map((tab) => <TabItem key={tab.id} tab={tab} active={tab.id === activeId} group={s.group} />)}
              </div>
            );
          }
          return s.tabs.map((tab) => <TabItem key={tab.id} tab={tab} active={tab.id === activeId} />);
        })}
      </div>
      <IconButton label={t('shell.tabs.new')} icon={<span aria-hidden="true">+</span>} className="np-tabstrip-new np-hit np-press-spring" onClick={() => commands.tabOpen()} />
      <span className="np-tablist-anchor">
        <IconButton
          label={t('shell.tabs.list')}
          icon={<IconList />}
          pressed={listOpen}
          className="np-tablist-toggle np-hit np-press-spring"
          onClick={() => setListOpen((o) => !o)}
        />
        {tabs.length > 1 ? <span className="np-tablist-count" aria-hidden="true">{tabs.length}</span> : null}
        {listOpen ? <TabList onClose={() => setListOpen(false)} /> : null}
      </span>
    </div>
  );
}
