import { useT } from '@newpaper/i18n/react';
import { Button, Switch } from '@newpaper/ui-kit';
import { useState } from 'react';
import { commands } from '../../ipc/commands';
import type { TabInfo } from '../../ipc/types';

export function CrashSurface({ tab }: { tab: TabInfo }) {
  const t = useT();
  const [report, setReport] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const reload = async () => {
    // Informe técnico opcional y local: versión, sistema y memoria. Nunca URL ni contenido (decisión 14).
    if (report && !saved) setSaved(await commands.crashReportSave({ reason: 'process-failed', exitCode: null, tabKind: tab.private ? 'private' : 'web', at: Date.now() }));
    await commands.tabReload(tab.id);
  };
  return (
    <div className="np-surface np-neterr" role="alert">
      <p className="np-404-kicker">{t('pages.crash.kicker')}</p>
      <h1>{t('pages.crash.title')}</h1>
      <p>{t('pages.crash.body')}</p>
      <Switch checked={report} onChange={setReport} label={t('pages.crash.report')} description={t('pages.crash.reportHint')} />
      {saved ? <p className="np-muted">{t('pages.crash.saved')}</p> : null}
      <div className="np-consent-actions">
        <Button variant="primary" onClick={() => void reload()}>{t('pages.crash.reload')}</Button>
      </div>
    </div>
  );
}
