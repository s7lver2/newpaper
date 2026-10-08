import { useT } from '@newpaper/i18n/react';
import { IconButton } from '@newpaper/ui-kit';
import { commands } from '../ipc/commands';
import { useActiveTab } from '../state/browser';
import { AddressBar } from './AddressBar';
import { IconBack, IconForward, IconReader, IconReload } from './icons';
import { toolbarItems } from './registry';

export function Toolbar() {
  const t = useT();
  const tab = useActiveTab();
  const id = tab?.id;
  return (
    <div className="np-toolbar">
      <nav aria-label={t('shell.nav.label')} className="np-toolbar-nav">
        <IconButton label={t('shell.nav.back')} icon={<IconBack />} disabled={!tab} onClick={() => id && commands.tabBack(id)} />
        <IconButton label={t('shell.nav.forward')} icon={<IconForward />} disabled={!tab?.canGoForward} onClick={() => id && commands.tabForward(id)} />
        <IconButton label={t('shell.nav.reload')} icon={<IconReload />} disabled={!tab || tab.kind !== 'web'} onClick={() => id && commands.tabReload(id)} />
      </nav>
      <AddressBar tab={tab} />
      {tab?.isNews ? (
        <IconButton
          label={tab.view === 'reader' ? t('shell.reader.original') : t('shell.reader.open')}
          icon={<IconReader />}
          pressed={tab.view === 'reader'}
          onClick={() => commands.tabSetView(tab.id, tab.view === 'reader' ? 'original' : 'reader')}
        />
      ) : null}
      <div className="np-toolbar-items">
        {toolbarItems().map(({ id: itemId, Component }) => (
          <Component key={itemId} tab={tab} />
        ))}
      </div>
    </div>
  );
}
