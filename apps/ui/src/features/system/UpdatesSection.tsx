import { useI18n } from '@newpaper/i18n/react';
import { Button, SegmentedControl } from '@newpaper/ui-kit';
import { useCallback, useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import { onUpdateStatus } from '../../ipc/events';
import type { ContentStatus, UpdateInfo, UpdateStatus } from '../../ipc/types';

export function UpdatesSection() {
  const { t, formatDate, formatNumber } = useI18n();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [content, setContent] = useState<ContentStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    const i = await commands.updateStatus();
    setInfo(i);
    setStatus(i.status);
    setContent(await commands.contentStatus());
  }, []);
  useEffect(() => {
    void reload();
    const un = onUpdateStatus(setStatus);
    return () => void un.then((f) => f());
  }, [reload]);
  if (!info) return null;

  const statusText = (() => {
    switch (status.state) {
      case 'idle':
        return t('updates.status.idle');
      case 'checking':
        return t('updates.status.checking');
      case 'upToDate':
        return t('updates.status.upToDate', { when: formatDate(new Date(status.checkedAt), { dateStyle: 'medium', timeStyle: 'short' }) });
      case 'downloading':
        return t('updates.status.downloading', { version: status.version, percent: status.total ? Math.round((status.received / status.total) * 100) : 0 });
      case 'ready':
        return t('updates.status.ready', { version: status.version });
      case 'torUnavailable':
        return t('updates.status.torUnavailable');
      case 'error':
        return t('updates.status.error', { message: status.message });
    }
  })();

  return (
    <div className="np-updates">
      <p>{t('updates.current', { version: info.current })}</p>
      <SegmentedControl
        label={t('updates.channel.label')}
        value={info.channel}
        onChange={(c) => void commands.updateSetChannel(c).then(reload)}
        options={[{ value: 'stable', label: t('updates.channel.stable') }, { value: 'beta', label: t('updates.channel.beta') }]}
      />
      <p className="np-muted">{t(`updates.channel.${info.channel}Hint`)}</p>
      <p role="status" aria-live="polite">{statusText}</p>
      {status.state === 'ready' && status.notes ? <pre className="np-notes">{status.notes}</pre> : null}
      <div className="np-wizard-actions">
        <Button disabled={status.state === 'checking' || status.state === 'downloading'} onClick={() => void commands.updateCheck()}>{t('updates.check')}</Button>
        {status.state === 'ready' ? (
          <Button variant="primary" onClick={() => void commands.updateInstallNow()}>{t('updates.installNow')}</Button>
        ) : null}
      </div>
      <p className="np-muted">{t('updates.signedNote')}</p>

      <h3>{t('updates.content.title')}</h3>
      <p>{content?.version ? t('updates.content.version', { version: content.version }) : t('updates.content.bundled')}</p>
      {content?.lastError ? <p className="np-muted">{t('updates.content.error', { message: content.lastError })}</p> : null}
      <div className="np-wizard-actions">
        <Button disabled={busy} onClick={() => { setBusy(true); void commands.contentCheckNow().finally(() => { setBusy(false); void reload(); }); }}>{t('updates.content.check')}</Button>
        {content?.history.some((h) => h.action === 'apply') ? (
          <Button variant="quiet" onClick={() => void commands.contentRevert().then(reload)}>{t('updates.content.revert')}</Button>
        ) : null}
      </div>
      {content?.history.length ? (
        <ul className="np-updates-history">
          {content.history.map((h) => (
            <li key={`${h.appliedAt}-${h.action}`}>
              <span className="np-mono">{formatDate(new Date(h.appliedAt), { dateStyle: 'medium' })}</span>{' '}
              {h.action === 'apply' ? t('updates.content.applied', { version: h.manifestVersion, n: formatNumber(h.resources.length) }) : t('updates.content.reverted', { version: h.manifestVersion })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
