import { useT } from '@newpaper/i18n/react';
import { IconButton } from '@newpaper/ui-kit';
import { commands } from '../ipc/commands';
import { useBrowser } from '../state/browser';
import { IconClose, IconPlus } from './icons';

export function TabStrip() {
  const t = useT();
  const { tabs, activeId } = useBrowser((s) => s.snapshot);
  return (
    <div className="np-tabstrip">
      <div role="tablist" aria-label={t('shell.tabs.label')} className="np-tabstrip-list">
        {tabs.map((tab) => {
          const title = tab.title || t('shell.tabs.untitled');
          return (
            <div key={tab.id} className="np-tabstrip-item" data-active={tab.id === activeId}>
              <button
                type="button"
                role="tab"
                aria-selected={tab.id === activeId}
                className="np-tabstrip-tab"
                onClick={() => commands.tabActivate(tab.id)}
              >
                {tab.loading ? <span className="np-pulse np-tab-dot" aria-label={t('shell.tabs.loading')} /> : null}
                <span className="np-tabstrip-title">{title}</span>
                {tab.private ? <span className="np-tab-private">{t('shell.tabs.private')}</span> : null}
              </button>
              <IconButton label={t('shell.tabs.close', { title })} icon={<IconClose />} className="np-tabstrip-close" onClick={() => commands.tabClose(tab.id)} />
            </div>
          );
        })}
      </div>
      <IconButton label={t('shell.tabs.new')} icon={<IconPlus />} onClick={() => commands.tabOpen()} />
    </div>
  );
}
