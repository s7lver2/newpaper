import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { commands } from '../ipc/commands';
import type { TabInfo } from '../ipc/types';

export function FallbackError({ tab }: { tab: TabInfo }) {
  const t = useT();
  const code = tab.failure?.httpStatus ?? tab.failure?.webErrorStatus ?? 0;
  return (
    <div className="np-surface np-fallback" role="alert">
      <h1 className="np-fallback-title">{t('shell.surface.errorTitle')}</h1>
      <p className="np-mono">{t('shell.surface.errorDetail', { code })}</p>
      <Button variant="primary" onClick={() => commands.tabReload(tab.id)}>
        {t('common.retry')}
      </Button>
    </div>
  );
}

export function FallbackCrash({ tab }: { tab: TabInfo }) {
  const t = useT();
  return (
    <div className="np-surface np-fallback" role="alert">
      <h1 className="np-fallback-title">{t('shell.surface.crashTitle')}</h1>
      <Button variant="primary" onClick={() => commands.tabReload(tab.id)}>
        {t('shell.surface.crashReload')}
      </Button>
    </div>
  );
}
