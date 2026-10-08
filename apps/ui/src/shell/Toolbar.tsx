import { useT } from '@newpaper/i18n/react';
import { IconButton } from '@newpaper/ui-kit';
import { commands } from '../ipc/commands';
import { useActiveTab } from '../state/browser';
import { AddressBar } from './AddressBar';
import { IconBack, IconForward, IconReader, IconReload, IconSettings } from './icons';
import { openInternal } from './navigate';
import { toolbarItems } from './registry';

export function Toolbar() {
  const t = useT();
  const tab = useActiveTab();
  const id = tab?.id;
  const items = toolbarItems();
  return (
    <div className="np-toolbar">
      <nav aria-label={t('shell.nav.label')} className="np-toolbar-nav">
        <IconButton className="np-hit" label={t('shell.nav.back')} icon={<IconBack />} disabled={!tab} onClick={() => id && commands.tabBack(id)} />
        <IconButton className="np-hit" label={t('shell.nav.forward')} icon={<IconForward />} disabled={!tab?.canGoForward} onClick={() => id && commands.tabForward(id)} />
        <IconButton className="np-hit" label={t('shell.nav.reload')} icon={<IconReload />} disabled={!tab || tab.kind !== 'web'} onClick={() => id && commands.tabReload(id)} />
      </nav>
      <AddressBar tab={tab}>
        {items.filter((i) => i.slot === 'address').map(({ id: itemId, Component }) => (
          <Component key={itemId} tab={tab} />
        ))}
      </AddressBar>
      {tab?.isNews ? (
        <IconButton
          className="np-hit"
          label={tab.view === 'reader' ? t('shell.reader.original') : t('shell.reader.open')}
          icon={<IconReader />}
          pressed={tab.view === 'reader'}
          onClick={() => commands.tabSetView(tab.id, tab.view === 'reader' ? 'original' : 'reader')}
        />
      ) : null}
      {items.filter((i) => i.slot !== 'address').map(({ id: itemId, Component }) => (
        <Component key={itemId} tab={tab} />
      ))}
      <IconButton className="np-hit" label={t('shell.settings')} icon={<IconSettings />} onClick={() => openInternal('ajustes', [], undefined, { newTab: true })} />
    </div>
  );
}
