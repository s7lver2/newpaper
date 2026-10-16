import { useI18n } from '@newpaper/i18n/react';
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useState } from 'react';

type Mode = 'direct' | 'tor';

/** Diagnóstico de Arti: fase, motivo de bloqueo aproximado y tiempos. `summary` es el texto técnico (en inglés). */
interface BootDetail {
  phase: 'connecting' | 'directory' | 'certificates' | 'descriptors';
  summary: string;
  blocked?: string;
  elapsedSecs: number;
  stalledSecs: number;
  cache: 'cold' | 'warm' | 'reset';
  cacheAgeSecs?: number;
  restartReason?: 'network_change' | 'retry' | 'reset';
}

/** A partir de aquí se avisa de que tarda y se ofrecen las acciones (reintentar, directa, restablecer). */
const SLOW_AFTER_SECS = 35;
/** Si el progreso no cambia en este tiempo se dice, para que no parezca congelado. */
const STALLED_AFTER_SECS = 6;

const PHASE_KEY = {
  connecting: 'mobile.torDiag.phaseConnecting',
  directory: 'mobile.torDiag.phaseDirectory',
  certificates: 'mobile.torDiag.phaseCertificates',
  descriptors: 'mobile.torDiag.phaseDescriptors',
} as const;

const BLOCKED_KEY: Record<string, string> = {
  offline: 'mobile.torDiag.blockedOffline',
  filtering: 'mobile.torDiag.blockedFiltering',
  cant_reach_tor: 'mobile.torDiag.blockedCantReach',
  clock_skewed: 'mobile.torDiag.blockedClock',
  cant_bootstrap: 'mobile.torDiag.blockedCantBootstrap',
};

/** Lo que devuelve `privacy_status` / `net_set_mode`. Rust decide la red; esta tarjeta solo pide el modo y muestra el estado. */
interface NetView {
  mode: Mode;
  tor:
    | { state: 'off' }
    | { state: 'bootstrapping'; percent: number; detail?: BootDetail }
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

  // Solo sondea mientras Tor conecta o está caído y reintenta (batería): al estar listo no hace falta.
  const polling = net?.mode === 'tor' && (net.tor.state === 'bootstrapping' || net.tor.state === 'failed');
  useEffect(() => {
    if (!polling) return;
    const id = window.setInterval(refresh, 1500);
    return () => window.clearInterval(id);
  }, [polling, refresh]);

  const act = (cmd: 'tor_retry' | 'tor_reset') => {
    setBusy(true);
    setErr(null);
    invoke<NetView>(cmd)
      .then(setNet)
      .catch((e) => setErr(errorText(e)))
      .finally(() => setBusy(false));
  };

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
    else if (net.tor.state === 'bootstrapping') {
      const d = net.tor.detail;
      status = t('mobile.connection.bootstrapping', { percent: net.tor.percent });
      if (d) status += ` · ${t(PHASE_KEY[d.phase] ?? PHASE_KEY.connecting)} · ${t('mobile.torDiag.elapsed', { seconds: d.elapsedSecs })}`;
    }
    else if (net.tor.state === 'failed') status = t('mobile.connection.failed');
    else status = t('mobile.connection.off');
  }

  const boot = mode === 'tor' && net?.tor.state === 'bootstrapping' ? net.tor : null;
  const failed = mode === 'tor' && net?.tor.state === 'failed' ? net.tor : null;
  const slow = !!boot && (boot.detail?.elapsedSecs ?? 0) >= SLOW_AFTER_SECS;
  const blockedKey = boot?.detail?.blocked ? (BLOCKED_KEY[boot.detail.blocked] ?? 'mobile.torDiag.blockedUnknown') : null;
  const d = boot?.detail;
  const stalled = !!d && d.stalledSecs >= STALLED_AFTER_SECS;

  return (
    <div className="m-card">
      <strong>{t('mobile.connection.title')}</strong>
      <div className="m-seg" role="group" aria-label={t('mobile.connection.title')} style={{ margin: '10px 0' }}>
        {(['direct', 'tor'] as const).map((v) => (
          <button key={v} type="button" aria-pressed={mode === v} disabled={busy} onClick={() => { if (v !== mode) choose(v); }}>
            {t(v === 'direct' ? 'mobile.connection.direct' : 'mobile.connection.tor')}
          </button>
        ))}
      </div>
      <p className="np-muted">{mode === 'tor' ? t('mobile.connection.torHint') : t('mobile.connection.directHint')}</p>
      {status ? <p role="status">{status}</p> : null}
      {blockedKey ? <p role="alert">{t(blockedKey)}</p> : null}
      {boot ? (
        <div className="m-conn-bar" role="progressbar" aria-valuenow={boot.percent} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ transform: `scaleX(${Math.max(0.03, boot.percent / 100)})` }} />
        </div>
      ) : null}
      {d?.restartReason === 'network_change' ? <p className="np-muted">{t('mobile.torDiag.networkChange')}</p> : null}
      {d ? <p className="np-muted">{t(d.cache === 'warm' ? 'mobile.torDiag.cacheWarm' : d.cache === 'reset' ? 'mobile.torDiag.cacheReset' : 'mobile.torDiag.cacheCold')}</p> : null}
      {stalled && d ? <p className="np-muted">{t('mobile.torDiag.stalled', { seconds: d.stalledSecs })}</p> : null}
      {slow ? <p className="np-muted">{t(d?.cache === 'cold' ? 'mobile.torDiag.slowCold' : 'mobile.torDiag.slow')}</p> : null}
      {slow ? (
        <div className="m-btn-row" style={{ padding: 0 }}>
          <button type="button" className="m-btn sec sm" disabled={busy} onClick={() => choose('direct')}>{t('mobile.torDiag.direct')}</button>
        </div>
      ) : null}
      {failed ? <p className="np-muted">{t('mobile.torDiag.lastError', { message: failed.message })}</p> : null}
      {d ? (
        <p className="np-muted" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>
          {t('mobile.torDiag.detail')}: {d.summary}
        </p>
      ) : null}
      {failed || blockedKey ? (
        <>
          <div className="m-btn-row" style={{ padding: 0 }}>
            <button type="button" className="m-btn sec sm" disabled={busy} onClick={() => act('tor_retry')}>{t('mobile.torDiag.retry')}</button>
            <button type="button" className="m-btn sec sm" disabled={busy} onClick={() => choose('direct')}>{t('mobile.torDiag.direct')}</button>
          </div>
          <div className="m-btn-row" style={{ padding: 0 }}>
            <button type="button" className="m-btn soft sm" disabled={busy} onClick={() => act('tor_reset')}>{t('mobile.torDiag.reset')}</button>
          </div>
          <p className="np-muted">{t('mobile.torDiag.resetHint')}</p>
        </>
      ) : null}
      <p className="np-muted">{t('mobile.connection.aiDirect')}</p>
      {err ? <p role="alert">{err}</p> : null}
    </div>
  );
}
