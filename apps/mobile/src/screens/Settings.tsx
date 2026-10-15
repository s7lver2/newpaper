import { useI18n } from '@newpaper/i18n/react';
import { Button, SegmentedControl } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { ipc, type PeerView } from '../ipc';
import { go } from '../router';

/** Ajustes del movil. La conexion es directa en esta version (sin Tor). */
export function Settings() {
  const { t, locale, setLocale } = useI18n();
  const [peers, setPeers] = useState<PeerView[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    void ipc.syncPeers().then((p) => setPeers(p.filter((x) => !x.revoked))).catch(() => {});
  }, []);
  return (
    <section>
      <h1 className="m-title">{t('settings.title')}</h1>
      <SegmentedControl
        label={t('settings.general.language')}
        value={locale}
        onChange={setLocale}
        options={[
          { value: 'es', label: 'Español' },
          { value: 'en', label: 'English' },
          { value: 'de', label: 'Deutsch' },
        ]}
      />
      <div className="m-card">
        <strong>{t('mobile.settings.network')}</strong>
        <p className="np-muted">{t('mobile.settings.direct')}</p>
      </div>
      <div className="m-card">
        <strong>{t('sync.devices')}</strong>
        {peers.length ? peers.map((p) => <p key={p.id}>{p.name} <span className="np-mono np-muted">{p.fingerprint}</span></p>) : <p className="np-muted">{t('sync.noDevices')}</p>}
        <div className="m-row">
          <Button onClick={() => go('emparejar')}>{t('sync.pair.start')}</Button>
          {peers.length ? (
            <Button
              onClick={() =>
                void ipc
                  .syncNow()
                  .then(() => setMsg(t('mobile.settings.synced')))
                  .catch((e) => setMsg(String((e as { message?: string }).message ?? e)))
              }
            >
              {t('sync.syncAll')}
            </Button>
          ) : null}
        </div>
        {msg ? <p role="status">{msg}</p> : null}
      </div>
      <div className="m-row">
        <Button onClick={() => go('proveedor')}>{t('providers.connectOne')}</Button>
        <Button variant="quiet" onClick={() => go('historial')}>{t('history.title')}</Button>
        <Button variant="quiet" onClick={() => go('edicion')}>{t('mobile.edition.title')}</Button>
      </div>
    </section>
  );
}
