import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { TabInfo } from '../../ipc/types';
import { openInternal } from '../../shell/navigate';
import { requestOpenWithoutTor } from '../privacy/withoutTor';
import { classifyFailure, type NetAction } from './netError';
import { NetArt } from './art';
import { NotFoundPage } from './NotFoundPage';

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function NetErrorSurface({ tab }: { tab: TabInfo }) {
  const t = useT();
  const online = useOnline();
  const [torBlocked, setTorBlocked] = useState(false);
  useEffect(() => {
    void commands.privacyStatus().then((s) => setTorBlocked(s.killSwitchActive)).catch(() => {});
  }, [tab.failure]);
  if (!tab.failure) return null;
  const failure = tab.failure;
  const { kind, actions } = classifyFailure(failure, { online, torBlocked });
  if (kind === 'notFound') return <div className="np-surface"><NotFoundPage address={failure.url} /></div>;
  const run = (a: NetAction) => {
    if (a === 'retry') return void commands.tabReload(tab.id);
    if (a === 'offlinePage') return void openInternal('sin-conexion');
    if (a === 'openWithoutTor') return void requestOpenWithoutTor(tab.id);
    if (a === 'archive') return void openInternal('hemeroteca', [], { url: failure.url });
    return void commands.tabBack(tab.id);
  };
  return (
    <div className="np-surface">
      <div className="np-sp np-neterr" role="alert" data-kind={kind}>
        <div className="np-sp-art"><NetArt kind={kind} /></div>
        <div className="np-sp-main np-rise">
          <p className="np-sp-kicker" data-tone={kind}>{t(`pages.netError.${kind}.kicker`)}</p>
          <h1>{t(`pages.netError.${kind}.title`)}</h1>
          <p className="np-sp-lead">{t(`pages.netError.${kind}.body`, { host: hostOf(failure.url) })}</p>
          <div className="np-sp-actions">
            {actions.map((a, i) => (
              <Button key={a} variant={i === 0 ? 'primary' : 'secondary'} onClick={() => run(a)}>{t(`pages.netError.actions.${a}`)}</Button>
            ))}
          </div>
          <p className="np-sp-code">{t('pages.netError.code', { code: failure.webErrorStatus })}</p>
        </div>
      </div>
    </div>
  );
}
