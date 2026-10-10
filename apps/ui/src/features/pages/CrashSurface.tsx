import { useT } from '@newpaper/i18n/react';
import { Button, Switch } from '@newpaper/ui-kit';
import { useState } from 'react';
import { commands } from '../../ipc/commands';
import type { TabInfo } from '../../ipc/types';
import { CrashArt } from './art';

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
    <div className="np-surface">
      <div className="np-sp np-neterr" role="alert" data-kind="crash">
        <div className="np-sp-art np-rise"><CrashArt /></div>
        <div className="np-sp-main np-rise">
          <p className="np-sp-kicker" data-tone="crash">{t('pages.crash.kicker')}</p>
          <h1>{t('pages.crash.title')}</h1>
          <p className="np-sp-lead">{t('pages.crash.body')}</p>
          <div className="np-sp-actions">
            <Button variant="primary" onClick={() => void reload()}>{t('pages.crash.reload')}</Button>
            <Button onClick={() => void commands.tabClose(tab.id)}>{t('pages.crash.close')}</Button>
          </div>
          <div className="np-sp-card">
            <Switch checked={report} onChange={setReport} label={t('pages.crash.report')} description={t('pages.crash.reportHint')} />
            {saved ? <p className="np-muted">{t('pages.crash.saved')}</p> : null}
          </div>
          <p className="np-sp-note">{t('pages.crash.safe')}</p>
        </div>
      </div>
    </div>
  );
}
