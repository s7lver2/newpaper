import { useI18n } from '@newpaper/i18n/react';
import { Button, Switch } from '@newpaper/ui-kit';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { commands } from '../../ipc/commands';
import { onSyncPaired, onSyncStatus } from '../../ipc/events';
import type { PairStart, PeerView, SyncScope, SyncStatus } from '../../ipc/types';
import { QrCode } from './QrCode';

const SCOPES: SyncScope[] = ['settings', 'history', 'saved', 'analyses', 'topics', 'sources', 'keys'];
const FILE_SCOPES: SyncScope[] = ['settings', 'history', 'saved', 'analyses', 'topics', 'sources'];

function errorMessage(e: unknown): string {
  return String((e as { message?: string }).message ?? e);
}

/** Direcciones de Tailscale: IPv4 en 100.64.0.0/10. */
export function isTailscaleAddress(addr: string): boolean {
  const m = /^100\.(\d+)\./.exec(addr);
  return m !== null && Number(m[1]) >= 64 && Number(m[1]) <= 127;
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function Fingerprint({ value }: { value: string }) {
  return (
    <span className="np-dev-fp">
      {value.split('-').map((g, i) => (
        <span key={`${i}-${g}`} className="np-dev-fp-group">
          {g}
        </span>
      ))}
    </span>
  );
}

function PeerCard({ p, lanIds, onChange }: { p: PeerView; lanIds: string[]; onChange(list: PeerView[]): void }) {
  const { t, formatDate } = useI18n();
  const [addr, setAddr] = useState(p.addresses.join(', '));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const update = (scopes: SyncScope[], sendKeys: boolean) =>
    void commands
      .syncPeerUpdate(p.id, scopes, sendKeys, addr.split(',').map((s) => s.trim()).filter(Boolean))
      .then(onChange)
      .catch((e: unknown) => setMsg(t('sync.peer.failed', { message: errorMessage(e) })));
  const toggle = (s: SyncScope, on: boolean) => {
    const next = on ? [...p.scopes.filter((x) => x !== s), s] : p.scopes.filter((x) => x !== s);
    update(next, s === 'keys' ? on : p.sendKeys);
  };
  const now = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const [r] = await commands.syncNow(p.id);
      setMsg(r ? t('sync.peer.done', { sent: r.sent, received: r.received }) : null);
      onChange(await commands.syncPeers());
    } catch (e) {
      setMsg(t('sync.peer.failed', { message: errorMessage(e) }));
    } finally {
      setBusy(false);
    }
  };
  const onLan = lanIds.includes(p.id);
  const via = onLan ? 'lan' : p.addresses.some(isTailscaleAddress) ? 'tailscale' : 'manual';
  const addressLabel = p.addresses[0] ?? '';

  return (
    <li className="np-dev-peer">
      <div className="np-dev-peer-head">
        <span className="np-dev-avatar" aria-hidden="true">
          <Icon>
            <rect x="7" y="3" width="10" height="18" rx="2" />
            <path d="M11 18h2" />
          </Icon>
        </span>
        <div className="np-dev-peer-id">
          <strong>{p.name}</strong>
          <span className="np-dev-via">
            <span className={`np-dev-dot np-dev-dot--${via === 'tailscale' ? 'tor' : via === 'lan' ? 'ok' : 'faint'}`} aria-hidden="true" />
            {t(`sync.via.${via}`)}
            {addressLabel ? <span className="np-mono np-muted">{addressLabel}</span> : null}
          </span>
          <span className="np-muted np-dev-last">
            {p.lastSyncAt ? t('sync.peer.last', { when: formatDate(new Date(p.lastSyncAt), { dateStyle: 'medium', timeStyle: 'short' }) }) : t('sync.peer.never')}
          </span>
          {p.lastError ? <span className="np-agent-error">{t('sync.peer.error', { message: p.lastError })}</span> : null}
        </div>
        <div className="np-dev-peer-actions">
          <Button variant="primary" disabled={busy} onClick={() => void now()} className="np-dev-sync">
            {busy ? t('sync.peer.syncing') : t('sync.peer.now')}
          </Button>
          <Button variant="secondary" className="np-dev-revoke" aria-expanded={confirming} onClick={() => setConfirming((c) => !c)}>
            {t('sync.peer.revoke')}
          </Button>
        </div>
      </div>
      {confirming ? (
        <div className="np-dev-confirm" role="alert">
          <span>{t('sync.peer.revokeConfirm')}{p.sendKeys ? <> {t('sync.peer.revokeKeysNote')}</> : null}</span>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            {t('sync.pair.cancel')}
          </Button>
          <Button variant="danger" onClick={() => void commands.syncRevoke(p.id).then(onChange)}>
            {t('sync.peer.revoke')}
          </Button>
        </div>
      ) : null}
      <div className="np-dev-scopes">
        <span className="np-dev-label">{t('sync.scopes.title')}</span>
        <div className="np-dev-scope-grid">
          {SCOPES.map((s) => (
            <Switch
              key={s}
              checked={p.scopes.includes(s)}
              onChange={(on) => toggle(s, on)}
              label={t(`sync.scopes.${s}`)}
              description={t(`sync.scopes.${s}Desc`)}
            />
          ))}
        </div>
        {p.scopes.includes('keys') ? (
          <p className="np-dev-warning">{t('sync.scopes.keysWarning')}</p>
        ) : null}
      </div>
      <label className="np-dev-field">
        <span>{t('sync.peer.addresses')}</span>
        <input value={addr} placeholder="100.101.102.103:47100" onChange={(e) => setAddr(e.target.value)} onBlur={() => update(p.scopes, p.sendKeys)} />
        <span className="np-muted">{t('sync.peer.addressesHint')}</span>
      </label>
      {msg ? <p role="status" className="np-dev-msg">{msg}</p> : null}
    </li>
  );
}

export function DevicesSection() {
  const { t, formatDate } = useI18n();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [peers, setPeers] = useState<PeerView[]>([]);
  const [pair, setPair] = useState<PairStart | null>(null);
  const [left, setLeft] = useState(0);
  const [code, setCode] = useState('');
  const [pairMsg, setPairMsg] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [fileMsg, setFileMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStatus(await commands.syncStatus());
    setPeers(await commands.syncPeers());
  }, []);

  useEffect(() => {
    void reload().then(() => commands.syncStatus().then((s) => setName(s.name)));
    const a = onSyncStatus(setStatus);
    const b = onSyncPaired(() => {
      setPair(null);
      void reload();
    });
    return () => {
      void a.then((f) => f());
      void b.then((f) => f());
    };
  }, [reload]);

  // Una oferta activa caduca en el servidor a los 2 minutos; aquí solo se muestra la cuenta atrás.
  useEffect(() => {
    if (!pair) return;
    let remaining = pair.expiresInSecs;
    setLeft(remaining);
    const h = setInterval(() => {
      remaining -= 1;
      setLeft(remaining);
      if (remaining <= 0) {
        clearInterval(h);
        setPair(null);
        void commands.syncPairCancel().catch(() => undefined);
      }
    }, 1000);
    return () => clearInterval(h);
  }, [pair]);

  // Al salir de la sección la oferta deja de ser válida.
  useEffect(() => () => void commands.syncPairCancel().catch(() => undefined), []);

  if (!status) return null;

  const tailscale = status.addresses.find(isTailscaleAddress);
  const liveIds = status.visible;
  const activePeers = peers.filter((p) => !p.revoked);
  const revokedPeers = peers.filter((p) => p.revoked);

  const startPairing = async () => {
    setPairMsg(null);
    try {
      setPair(await commands.syncPairStart());
    } catch (e) {
      setPairMsg(t('sync.peer.failed', { message: errorMessage(e) }));
    }
  };

  const useCode = async () => {
    setPairMsg(null);
    try {
      await commands.syncPairWith(code.trim());
      setCode('');
      await reload();
    } catch (e) {
      setPairMsg(t('sync.peer.failed', { message: errorMessage(e) }));
    }
  };

  const exportFile = async () => {
    const path = await saveDialog({ defaultPath: 'newpaper.npsync', filters: [{ name: 'newpaper', extensions: ['npsync'] }] });
    if (!path) return;
    try {
      await commands.syncExport(path, pass, FILE_SCOPES);
      setFileMsg(t('sync.backup.exported'));
    } catch (e) {
      setFileMsg(t('sync.backup.failed', { message: errorMessage(e) }));
    }
  };

  const importFile = async () => {
    const path = await openDialog({ multiple: false, filters: [{ name: 'newpaper', extensions: ['npsync'] }] });
    if (!path || Array.isArray(path)) return;
    try {
      const n = await commands.syncImport(path, pass);
      setFileMsg(t('sync.backup.imported', { n }));
    } catch (e) {
      const c = (e as { code?: string }).code;
      setFileMsg(c === 'wrong_passphrase' ? t('sync.backup.wrongPassphrase') : t('sync.backup.failed', { message: errorMessage(e) }));
    }
  };

  return (
    <div className="np-devices">
      <div className="np-dev-col">
        <section className="np-dev-card">
          <span className="np-dev-label">{t('sync.thisDevice')}</span>
          <label className="np-dev-field">
            <span>{t('sync.name')}</span>
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={() => void commands.syncSetName(name).catch(() => undefined)} />
          </label>
          <span className="np-dev-fp-label np-muted">{t('sync.fingerprintLabel')}</span>
          <Fingerprint value={status.fingerprint} />
          <Switch checked={status.enabled} onChange={(v) => void commands.syncSetEnabled(v).then(setStatus)} label={t('sync.enable')} description={t('sync.enableHint')} />
          {status.last ? (
            <p className="np-muted">
              {t('sync.last', { when: formatDate(new Date(status.last.at), { timeStyle: 'short' }), name: status.last.peerName, sent: status.last.sent, received: status.last.received })}
            </p>
          ) : null}
          {tailscale ? (
            <p className="np-dev-tailscale">
              <span className="np-dev-dot np-dev-dot--tor" aria-hidden="true" />
              {t('sync.tailscale', { addr: tailscale })}
            </p>
          ) : null}
          <p className="np-dev-e2e">
            <Icon>
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 018 0v4" />
            </Icon>
            {t('sync.e2e')}
          </p>
          <p className="np-muted">{t('sync.never')}</p>
        </section>

        <section className="np-dev-card np-dev-pairing">
          {pair ? (
            <div className="np-dev-qr">
              <div className="np-dev-qr-frame">
                <QrCode size={pair.size} modules={pair.modules} label={t('sync.pair.qr')} />
              </div>
              <span className="np-dev-title">{t('sync.qrTitle')}</span>
              <span className="np-muted">{t('sync.qrHint')}</span>
              <span className="np-mono np-muted">{t('sync.pair.expires', { s: left })}</span>
              <p className="np-muted">{t('sync.pair.scan')}</p>
              <div className="np-dev-actions">
                <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(pair.code).catch(() => undefined)}>
                  {t('sync.pair.copy')}
                </Button>
                <Button variant="quiet" onClick={() => void commands.syncPairCancel().then(() => setPair(null))}>
                  {t('sync.pair.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="np-dev-idle">
              <span className="np-dev-avatar np-dev-avatar--accent" aria-hidden="true">
                <Icon>
                  <path d="M5 12.5a10 10 0 0114 0M8.5 15.5a5 5 0 017 0" />
                  <circle cx="12" cy="19" r="1" />
                </Icon>
              </span>
              <div>
                <div className="np-dev-title">{t('sync.pair.idle')}</div>
                <div className="np-muted">{status.enabled ? t('sync.pair.idleSub') : t('sync.pair.needsEnable')}</div>
              </div>
              <Button variant="primary" disabled={!status.enabled} onClick={() => void startPairing()}>
                {t('sync.pair.start')}
              </Button>
            </div>
          )}
          <div className="np-dev-code">
            <label className="np-dev-field">
              <span>{t('sync.pair.haveCode')}</span>
              <input value={code} spellCheck={false} onChange={(e) => setCode(e.target.value)} />
            </label>
            <Button disabled={!code.trim().startsWith('np1:')} onClick={() => void useCode()}>
              {t('sync.pair.useCode')}
            </Button>
            {pairMsg ? <p role="status" className="np-dev-msg">{pairMsg}</p> : null}
          </div>
        </section>
      </div>

      <div className="np-dev-col np-dev-col--wide">
        <section className="np-dev-card">
          <div className="np-dev-head">
            <span className="np-dev-label">{t('sync.devicesCount', { n: activePeers.length })}</span>
            <span className="np-muted np-dev-hint">{t('sync.devicesHint')}</span>
          </div>
          {activePeers.length === 0 ? <p className="np-muted np-dev-empty">{t('sync.noDevices')}</p> : null}
          <ul className="np-dev-peers">
            {activePeers.map((p) => (
              <PeerCard key={p.id} p={p} lanIds={liveIds} onChange={setPeers} />
            ))}
          </ul>
          {revokedPeers.map((p) => (
            <p key={p.id} className="np-muted np-dev-revoked">
              {p.name} · {t('sync.peer.revoked')}
            </p>
          ))}
          {activePeers.length > 0 ? (
            <div className="np-dev-actions">
              <Button onClick={() => void commands.syncNow().then(reload)}>{t('sync.syncAll')}</Button>
            </div>
          ) : null}
        </section>
      </div>

      <section className="np-dev-card np-dev-backup">
        <div className="np-dev-backup-text">
          <span className="np-dev-label">{t('sync.backup.label')}</span>
          <div className="np-dev-serif">{t('sync.backup.headline')}</div>
          <span className="np-muted">{t('sync.backup.hint')}</span>
        </div>
        <div className="np-dev-backup-controls">
          <label className="np-dev-field">
            <span>{t('sync.backup.passphrase')}</span>
            <input type="password" value={pass} autoComplete="new-password" onChange={(e) => setPass(e.target.value)} />
          </label>
          <div className="np-dev-actions">
            <Button variant="primary" disabled={pass.length < 8} onClick={() => void exportFile()}>
              {t('sync.backup.export')}
            </Button>
            <Button disabled={pass.length < 1} onClick={() => void importFile()}>
              {t('sync.backup.import')}
            </Button>
          </div>
          {fileMsg ? <p role="status" className="np-dev-msg">{fileMsg}</p> : null}
        </div>
      </section>
    </div>
  );
}

/** Resumen de la entrada de Ajustes: número de dispositivos emparejados activos. */
export function DevicesSummary() {
  const { t } = useI18n();
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    void commands
      .syncPeers()
      .then((list) => setN(list.filter((p) => !p.revoked).length))
      .catch(() => setN(0));
  }, []);
  return <>{t('sync.summary', { n: n ?? 0 })}</>;
}
