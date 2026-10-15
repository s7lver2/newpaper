import { useI18n } from '@newpaper/i18n/react';
import { SegmentedControl } from '@newpaper/ui-kit';
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';

type Mode = 'direct' | 'tor';

/** Lo que devuelve `privacy_status` / `net_set_mode`. Rust decide la red; esta tarjeta solo pide el modo y muestra el estado. */
interface NetView {
  mode: Mode;
  tor:
    | { state: 'off' }
    | { state: 'bootstrapping'; percent: number }
    | { state: 'ready' }
    | { state: 'failed'; message: string };
  killSwitchActive: boolean;
}

function errorText(e: unknown): string {
  return String((e as { message?: string }).message ?? e);
}

/** Tarjeta de Ajustes: modo de conexión (Directa / Tor) y estado de Tor. */
export function ConnectionCard() {
  const { t } = useI18n();
  const [net, setNet] = useState<NetView | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void invoke<NetView>('privacy_status').then(setNet).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Solo sondea mientras Tor conecta (batería): al terminar, el estado llega en la siguiente petición.
  const bootstrapping = net?.tor.state === 'bootstrapping';
  useEffect(() => {
    if (!bootstrapping) return;
    const id = window.setInterval(refresh, 1500);
    return () => window.clearInterval(id);
  }, [bootstrapping, refresh]);

  const choose = (mode: Mode) => {
    setBusy(true);
    setErr(null);
    invoke<NetView>('net_set_mode', { mode })
      .then(setNet)
      .catch((e) => setErr(errorText(e)))
      .finally(() => setBusy(false));
  };

  const mode: Mode = net?.mode ?? 'direct';
  let status: string | null = null;
  if (mode === 'tor' && net) {
    if (net.tor.state === 'ready') status = t('mobile.connection.ready');
    else if (net.tor.state === 'bootstrapping') status = t('mobile.connection.bootstrapping', { percent: net.tor.percent });
    else if (net.tor.state === 'failed') status = t('mobile.connection.failed');
    else status = t('mobile.connection.off');
  }

  return (
    <div className="m-card">
      <strong>{t('mobile.connection.title')}</strong>
      <SegmentedControl<Mode>
        label={t('mobile.connection.title')}
        value={mode}
        onChange={(v) => {
          if (!busy && v !== mode) choose(v);
        }}
        options={[
          { value: 'direct', label: t('mobile.connection.direct') },
          { value: 'tor', label: t('mobile.connection.tor') },
        ]}
      />
      <p className="np-muted">{mode === 'tor' ? t('mobile.connection.torHint') : t('mobile.connection.directHint')}</p>
      {status ? <p role="status">{status}</p> : null}
      <p className="np-muted">{t('mobile.connection.aiDirect')}</p>
      {err ? <p role="alert">{err}</p> : null}
    </div>
  );
}
