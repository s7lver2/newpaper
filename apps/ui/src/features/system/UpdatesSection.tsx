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

  const busyCheck = status.state === 'checking' || status.state === 'downloading';
  return (
    <section className="np-settings-section np-stagger np-sys-sec" aria-labelledby="np-set-updates">
      <div>
        <h2 id="np-set-updates" className="np-settings-h2">{t('settings.updates.title')}</h2>
        <p className="np-settings-hint">{t('settings.updates.description')}</p>
      </div>
      <div className="np-settings-card np-switch-card">
        <div className="np-set-row">
          <div className="np-set-text">
            <span className="np-set-name">{t('updates.current', { version: info.current })}</span>
            <span className="np-set-desc" role="status" aria-live="polite">{statusText}</span>
          </div>
          <div className="np-set-actions">
            <Button className="np-set-btn" disabled={busyCheck} onClick={() => void commands.updateCheck()}>{t('updates.check')}</Button>
            {status.state === 'ready' ? (
              <Button className="np-set-btn" variant="primary" onClick={() => void commands.updateInstallNow()}>{t('updates.installNow')}</Button>
            ) : null}
          </div>
        </div>
        <div className="np-set-row">
          <div className="np-set-text">
            <span className="np-set-name">{t('updates.channel.label')}</span>
            <span className="np-set-desc">{t(`updates.channel.${info.channel}Hint`)}</span>
          </div>
          <SegmentedControl
            label={t('updates.channel.label')}
            value={info.channel}
            onChange={(c) => void commands.updateSetChannel(c).then(reload)}
            options={[{ value: 'stable', label: t('updates.channel.stable') }, { value: 'beta', label: t('updates.channel.beta') }]}
          />
        </div>
        {status.state === 'ready' && status.notes ? <pre className="np-notes">{status.notes}</pre> : null}
        <p className="np-set-desc np-set-foot">{t('updates.signedNote')}</p>
      </div>

      <h3 className="np-settings-h3">{t('updates.content.title')}</h3>
      <div className="np-settings-card np-switch-card">
        <div className="np-set-row">
          <div className="np-set-text">
            <span className="np-set-name">{content?.version ? t('updates.content.version', { version: content.version }) : t('updates.content.bundled')}</span>
            {content?.lastError ? <span className="np-set-desc">{t('updates.content.error', { message: content.lastError })}</span> : null}
          </div>
          <div className="np-set-actions">
            <Button className="np-set-btn" disabled={busy} onClick={() => { setBusy(true); void commands.contentCheckNow().finally(() => { setBusy(false); void reload(); }); }}>{t('updates.content.check')}</Button>
            {content?.history.some((h) => h.action === 'apply') ? (
              <Button className="np-set-btn" variant="quiet" onClick={() => void commands.contentRevert().then(reload)}>{t('updates.content.revert')}</Button>
            ) : null}
          </div>
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
    </section>
  );
}

/** Segunda línea de la entrada "Actualizaciones" en la barra lateral de Ajustes: la versión instalada. */
export function UpdatesSummary() {
  const { t } = useI18n();
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    void commands.updateStatus().then((i) => setVersion(i.current)).catch(() => {});
  }, []);
  return <>{version ? t('settings.updates.version', { version }) : t('settings.updates.description')}</>;
}
