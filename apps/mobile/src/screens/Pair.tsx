import { useI18n } from '@newpaper/i18n/react';
import { cancel, checkPermissions, Format, openAppSettings, requestPermissions, scan } from '@tauri-apps/plugin-barcode-scanner';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { resetPipeline } from '../ai/pipeline';
import { ipc, type OllamaProbe, type PeerView, type SyncReport } from '../ipc';
import { go, useBackClose } from '../router';
import { barsOverDark } from '../theme';
import { Bar } from './Bar';

type View = 'intro' | 'scan' | 'manual' | 'denied' | 'handshake' | 'fingerprint' | 'scope' | 'done';

/** Duración mínima del apretón de manos (mockup Movil-Emparejar: 3,6 s). El intercambio real puede acabar antes. */
const HANDSHAKE_MS = 3600;
/** Secciones que el emparejamiento puede sincronizar: las mismas claves que Ajustes de escritorio. */
const SCOPES = ['settings', 'history', 'saved', 'analyses', 'topics', 'sources', 'keys'] as const;

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

function Bullet({ icon, title, sub }: { icon: ReactNode; title: string; sub: string }) {
  return (
    <div className="m-row">
      <span className="m-ico acc">{icon}</span>
      <span className="m-row-body">
        <b>{title}</b>
        <span>{sub}</span>
      </span>
    </div>
  );
}

/** Enlace PC↔móvil: dos equipos, una línea discontinua y dos paquetes que la recorren en sentidos opuestos. */
function Link({ phase }: { phase: 'intro' | 'handshake' | 'ok' }) {
  return (
    <svg className={`m-link m-link-${phase}`} viewBox="0 0 280 110" width="100%" height="110" aria-hidden="true">
      <rect x="30" y="14" width="130" height="74" rx="9" fill="var(--np-card)" stroke="var(--np-line3)" strokeWidth="1.5" />
      <path d="M80 98h30M95 88v10" stroke="var(--np-line3)" strokeWidth="1.5" strokeLinecap="round" />
      {phase === 'intro' ? <g fill="var(--np-ink)"><rect x="78" y="30" width="12" height="12" rx="2" /><rect x="100" y="30" width="12" height="12" rx="2" /><rect x="78" y="52" width="12" height="12" rx="2" /><rect x="100" y="56" width="6" height="6" /><rect x="110" y="48" width="6" height="6" /></g> : null}
      <rect x="206" y="22" width="44" height="76" rx="9" fill="var(--np-card)" stroke="var(--np-ink)" strokeWidth="1.8" />
      {phase === 'intro' ? <rect x="216" y="44" width="24" height="24" rx="5" fill="none" stroke="var(--np-accent)" strokeWidth="1.8" /> : null}
      <path className="m-link-line" d="M170 52c10-4 22 0 30 4" stroke="var(--np-accent)" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 7" fill="none" />
      <circle className="m-packet qr" cx="170" cy="52" r="3.5" />
      <circle className="m-packet ok" cx="200" cy="56" r="3.5" />
    </svg>
  );
}

/** Apretón de manos: SYN/ACK y clave entre los dos equipos; el candado se cierra al derivar la clave. */
function Handshake() {
  const { t } = useI18n();
  return (
    <div className="m-hs" role="status" aria-live="polite">
      <svg viewBox="0 0 300 150" width="100%" height="150" aria-hidden="true" className="m-hs-art">
        <rect x="12" y="34" width="86" height="60" rx="8" fill="var(--np-card)" stroke="var(--np-line3)" strokeWidth="1.5" />
        <rect x="202" y="34" width="50" height="60" rx="9" fill="var(--np-card)" stroke="var(--np-ink)" strokeWidth="1.8" />
        <path className="m-hs-line" d="M98 64H202" stroke="var(--np-accent)" strokeWidth="2" strokeDasharray="4 6" />
        <circle className="m-hs-pkt syn" cx="98" cy="64" r="4" />
        <circle className="m-hs-pkt ack" cx="202" cy="64" r="4" />
        <circle className="m-hs-pkt key" cx="98" cy="64" r="3" />
        <g className="m-hs-lock">
          <rect x="136" y="56" width="28" height="22" rx="4" fill="var(--np-ink)" />
          <path className="m-hs-shackle" d="M141 56v-5a9 9 0 0118 0v5" fill="none" stroke="var(--np-ink)" strokeWidth="3" />
        </g>
      </svg>
      <ol className="m-hs-steps">
        {(['hs1', 'hs2', 'hs3', 'hs4'] as const).map((k, i) => (
          <li key={k} style={{ animationDelay: `${i * 0.7}s` }}>
            <span className="m-hs-dot" aria-hidden="true" />
            {t(`mobile.pair.${k}`)}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Huella: todos los grupos (5 de 4 caracteres) que barajan y se fijan de uno en uno. Los valores que se fijan son los reales del emparejamiento. */
function Fingerprint({ fp, onMatch, onMismatch }: { fp: string; onMatch: () => void; onMismatch: () => void }) {
  const { t } = useI18n();
  const groups = fp.replace(/[^0-9A-Za-z]/g, '').match(/.{1,4}/g) ?? [fp];
  const [shown, setShown] = useState<string[]>(groups.map(() => '••••'));
  const [fixed, setFixed] = useState(0);
  const [match, setMatch] = useState(false);
  const fixedRef = useRef(0);

  useEffect(() => {
    const shuffle = window.setInterval(() => {
      setShown((cur) => cur.map((g, i) => (i < fixedRef.current ? g : Math.random().toString(16).slice(2, 6).toUpperCase().padEnd(4, '0'))));
    }, 70);
    const timers = groups.map((g, i) =>
      window.setTimeout(() => {
        fixedRef.current = i + 1;
        setShown((cur) => cur.map((x, j) => (j <= i ? groups[j]! : x)));
        setFixed(i + 1);
      }, 480 + i * 200),
    );
    return () => {
      window.clearInterval(shuffle);
      timers.forEach((x) => window.clearTimeout(x));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fp]);

  const confirm = () => {
    setMatch(true);
    window.setTimeout(onMatch, 900);
  };

  return (
    <div className={`m-fp${match ? ' match' : ''}`}>
      <p className="m-kicker">{t('mobile.pair.fpTitle')}</p>
      <div className="m-fp-groups" aria-label={t('mobile.pair.fpLabel')}>
        {shown.map((g, i) => (
          <b key={i} className={`np-mono${i < fixed ? ' on' : ''}`}>{g}</b>
        ))}
      </div>
      {fixed >= groups.length ? (
        <>
          <p className="m-muted" style={{ margin: '12px 0 0' }}>{t('mobile.pair.fpAsk')}</p>
          <div className="m-btn-row" style={{ flexDirection: 'column', padding: 0, marginTop: 14 }}>
            <button type="button" className="m-btn" disabled={match} onClick={confirm}>{t('mobile.pair.fpMatch')}</button>
            <button type="button" className="m-btn sec" disabled={match} onClick={onMismatch}>{t('mobile.pair.fpNoMatch')}</button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Pantalla «Emparejar» (Movil-Emparejar): intro, escáner a pantalla completa, apretón, huella, alcance y resultado. */
export function Pair() {
  const { t } = useI18n();
  const [view, setView] = useState<View>('intro');
  const [code, setCode] = useState('');
  const [peer, setPeer] = useState<PeerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ollama, setOllama] = useState<OllamaProbe | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [report, setReport] = useState<SyncReport | null>(null);
  const scanning = useRef(false);
  const cancelledHandshake = useRef(false);
  // Un emparejamiento solo vale si el usuario confirma la huella: si se sale de la pantalla antes (Atrás, otra pestaña)
  // se revoca el equipo recién añadido y se descarta un apretón de manos en curso.
  const pendingPeer = useRef<string | null>(null);
  useEffect(
    () => () => {
      cancelledHandshake.current = true;
      if (pendingPeer.current) void ipc.syncRevoke(pendingPeer.current).catch(() => {});
    },
    [],
  );

  const layer = view === 'scan' || view === 'manual' || view === 'denied';
  const dismiss = useBackClose(layer, () => {
    if (scanning.current) void cancel().catch(() => {});
    scanning.current = false;
    setView('intro');
  });

  /** Empareja con el código del PC. El apretón dura al menos 3,6 s; la X durante ese tiempo descarta el resultado. */
  const pairWith = async (c: string) => {
    setView('handshake');
    setError(null);
    setOllama(null);
    cancelledHandshake.current = false;
    const started = Date.now();
    try {
      const p = await ipc.syncPairWith(c.trim());
      await sleep(Math.max(0, HANDSHAKE_MS - (Date.now() - started)));
      if (cancelledHandshake.current) {
        await ipc.syncRevoke(p.id).catch(() => {});
        return;
      }
      setPeer(p);
      pendingPeer.current = p.id;
      setView('fingerprint');
      for (const addr of p.addresses) {
        try {
          setOllama(await ipc.ollamaProbe(`http://${addr.split(':')[0]}:11434`));
          break;
        } catch {
          /* este PC no comparte su Ollama en esta dirección */
        }
      }
    } catch (e) {
      setError(t('mobile.pair.failed', { message: String((e as { message?: string }).message ?? e) }));
      setView('intro');
    }
  };

  const mismatch = async () => {
    pendingPeer.current = null;
    if (peer) await ipc.syncRevoke(peer.id).catch(() => {});
    setPeer(null);
    setError(t('mobile.pair.fpMismatch'));
    setView('intro');
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const r = await ipc.syncNow();
      setReport(r.find((x) => x.peerId === peer?.id) ?? r[0] ?? null);
    } catch (e) {
      setError(t('mobile.pair.failed', { message: String((e as { message?: string }).message ?? e) }));
    } finally {
      setSyncing(false);
      resetPipeline();
      setView('done');
    }
  };

  const startScan = async () => {
    setError(null);
    try {
      let perm = await checkPermissions();
      if (perm !== 'granted') perm = await requestPermissions();
      if (perm !== 'granted') return setView('denied');
    } catch {
      return setView('manual');
    }
    setView('scan');
  };

  // El escáner corre mientras la vista es «scan»: el plugin pinta la cámara detrás de la webview (transparente).
  useEffect(() => {
    if (view !== 'scan') return;
    document.documentElement.classList.add('m-scanning');
    barsOverDark(true);
    scanning.current = true;
    let live = true;
    void scan({ windowed: true, formats: [Format.QRCode] })
      .then((r) => {
        scanning.current = false;
        if (!live) return;
        if (r.content.startsWith('np1:')) void pairWith(r.content);
        else {
          setError(t('mobile.pair.notNewpaper'));
          setView('intro');
        }
      })
      .catch((e: unknown) => {
        scanning.current = false;
        if (!live) return;
        const msg = String((e as { message?: string }).message ?? e);
        setError(/cancel/i.test(msg) ? null : t('mobile.pair.unavailable'));
        setView('intro');
      });
    return () => {
      live = false;
      document.documentElement.classList.remove('m-scanning');
      barsOverDark(false);
      if (scanning.current) void cancel().catch(() => {});
      scanning.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  if (view === 'scan') {
    return (
      <section className="m-scan" aria-label={t('mobile.pair.scanTitle')}>
        <header className="m-scan-top">
          <button type="button" className="m-scan-btn" aria-label={t('mobile.pair.closeScan')} onClick={() => dismiss()}>
            <svg viewBox="0 0 24 24" width="24" height="24" {...stroke} aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <h1>{t('mobile.pair.scanTitle')}</h1>
          <span style={{ width: 48 }} />
        </header>
        <p className="m-scan-chip" role="status"><i aria-hidden="true" />{t('mobile.pair.searching')}</p>
        <div className="m-scan-frame" aria-hidden="true">
          <b style={{ animationDelay: '0s' }} /><b style={{ animationDelay: '.3s' }} /><b style={{ animationDelay: '.6s' }} /><b style={{ animationDelay: '.9s' }} />
          <span className="m-scan-line" />
        </div>
        <footer className="m-scan-bottom">
          <p>{t('mobile.pair.scanHint')}</p>
          <button type="button" className="m-scan-manual" onClick={() => { void cancel().catch(() => {}); scanning.current = false; setView('manual'); }}>
            <svg viewBox="0 0 24 24" width="22" height="22" {...stroke} aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" /></svg>
            {t('mobile.pair.manual')}
          </button>
        </footer>
      </section>
    );
  }

  if (view === 'handshake') {
    return (
      <section>
        <Bar title={t('sync.pair.title')} onBack={() => { cancelledHandshake.current = true; setView('intro'); }} />
        <Link phase="handshake" />
        <h2 className="m-title-sm" style={{ margin: '8px var(--m-gutter) 4px' }}>{t('mobile.pair.hsTitle')}</h2>
        <Handshake />
      </section>
    );
  }

  if (view === 'fingerprint' && peer) {
    return (
      <section>
        <Bar title={t('sync.pair.title')} onBack={() => void mismatch()} />
        <div className="m-state" style={{ paddingBottom: 0 }}>
          <h2>{t('mobile.pair.success', { name: peer.name })}</h2>
        </div>
        <div className="m-card">
          <Fingerprint fp={peer.fingerprint} onMatch={() => { pendingPeer.current = null; setView('scope'); }} onMismatch={() => void mismatch()} />
        </div>
      </section>
    );
  }

  if (view === 'scope' && peer) {
    const on = new Set(peer.scopes);
    return (
      <section>
        <Bar title={t('sync.scopes.title')} />
        <p className="m-sub">{t('mobile.pair.scopeLead', { name: peer.name })}</p>
        <div className="m-group" style={{ marginTop: 12 }}>
          {SCOPES.filter((s) => on.has(s)).map((s, i) => (
            <div key={s} className="m-row m-scope-row" style={{ animationDelay: `${i * 45}ms` }}>
              <span className="m-row-body">
                <b>{t(`sync.scopes.${s}`)}</b>
                <span>{t(`sync.scopes.${s}Desc`)}</span>
              </span>
              <span className="m-scope-check" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" {...stroke} strokeWidth={2.2}><path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </span>
            </div>
          ))}
        </div>
        {on.size === 0 ? <p className="m-hint">{t('mobile.pair.scopeNone')}</p> : null}
        <div className="m-btn-row" style={{ flexDirection: 'column', marginTop: 16 }}>
          <button type="button" className="m-btn" disabled={syncing} onClick={() => void syncNow()}>
            {syncing ? t('mobile.pair.syncing') : t('mobile.pair.syncNow')}
          </button>
        </div>
      </section>
    );
  }

  if (view === 'denied') {
    return (
      <section>
        <Bar title={t('sync.pair.title')} />
        <div className="m-state">
          <span className="m-state-ico warn" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="34" height="34" {...stroke}><path d="M4 8h3l1.5-2h7L17 8h3v11H4zM12 16a3 3 0 100-6 3 3 0 000 6M4 4l16 16" /></svg>
          </span>
          <h2>{t('mobile.pair.deniedTitle')}</h2>
          <p>{t('mobile.pair.deniedBody')}</p>
          <p className="m-hint">{t('mobile.pair.deniedHow')}</p>
        </div>
        <div className="m-btn-row" style={{ flexDirection: 'column' }}>
          <button type="button" className="m-btn" onClick={() => void openAppSettings().catch(() => {})}>{t('mobile.pair.openSettings')}</button>
          <button type="button" className="m-btn sec" onClick={() => setView('manual')}>{t('mobile.pair.manual')}</button>
        </div>
      </section>
    );
  }

  if (view === 'done' && peer) {
    return (
      <section>
        <Bar title={t('sync.pair.title')} />
        <div className="m-state">
          <span className="m-check" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          <h2>{t('mobile.pair.success', { name: peer.name })}</h2>
          <p className="np-mono">{t('mobile.pair.successSub', { fp: peer.fingerprint })}</p>
          {report ? <p className="m-hint m-ok">{t('mobile.pair.syncReport', { sent: report.sent, received: report.received })}</p> : null}
        </div>
        {ollama ? (
          <div className="m-card">
            <strong>{t('mobile.pair.ollamaTitle', { name: peer.name })}</strong>
            <p className="m-muted">{t('mobile.pair.ollamaBody', { n: ollama.models.length })}</p>
            <button
              type="button"
              className="m-btn"
              onClick={() =>
                void ipc.usePcOllama(ollama.base).then(() => {
                  resetPipeline();
                  go('ia');
                })
              }
            >
              {t('mobile.pair.ollamaUse')}
            </button>
          </div>
        ) : (
          <p className="m-hint">{t('mobile.pair.ollamaHint')}</p>
        )}
        <div className="m-btn-row" style={{ marginTop: 8 }}>
          <button type="button" className="m-btn sec" onClick={() => go('ajustes')}>{t('mobile.pair.done')}</button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <Bar title={t('sync.pair.title')} />
      <div className="m-pair-art" aria-hidden="true">
        <Link phase="intro" />
      </div>
      <h2 className="m-title-sm" style={{ margin: '4px var(--m-gutter) 8px' }}>{t('mobile.pair.introTitle')}</h2>
      <p className="m-muted" style={{ margin: '0 var(--m-gutter) 18px' }}>{t('mobile.pair.introBody')}</p>
      <div className="m-group">
        <Bullet icon={<svg viewBox="0 0 24 24" width="20" height="20" {...stroke}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>} title={t('mobile.pair.b1')} sub={t('mobile.pair.b1s')} />
        <Bullet icon={<svg viewBox="0 0 24 24" width="20" height="20" {...stroke}><path d="M3 9a14 14 0 0118 0M6 12.5a9 9 0 0112 0M9 16a4.5 4.5 0 016 0M12 19.5h.01" /></svg>} title={t('mobile.pair.b2')} sub={t('mobile.pair.b2s')} />
        <Bullet icon={<svg viewBox="0 0 24 24" width="20" height="20" {...stroke}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" /></svg>} title={t('mobile.pair.b3')} sub={t('mobile.pair.b3s')} />
      </div>
      {error ? <p role="alert" className="m-hint m-bad">{error}</p> : null}
      <div className="m-btn-row" style={{ flexDirection: 'column', marginTop: 20 }}>
        <button type="button" className="m-btn" onClick={() => void startScan()}>{t('mobile.pair.scan')}</button>
        <button type="button" className="m-btn sec" onClick={() => setView('manual')}>{t('mobile.pair.manual')}</button>
      </div>
      {view === 'manual' ? (
        <>
          <div className="m-scrim" onClick={() => dismiss()} aria-hidden="true" />
          <div className="m-sheet" role="dialog" aria-modal="true" aria-label={t('mobile.pair.manualTitle')}>
            <div className="m-grab" />
            <h2 className="m-title-sm">{t('mobile.pair.manualTitle')}</h2>
            <p className="m-muted" style={{ margin: '6px 0 14px' }}>{t('mobile.pair.manualHint')}</p>
            <label className="m-field" style={{ margin: '0 0 16px' }}>
              <span>{t('sync.pair.haveCode')}</span>
              <input className="m-input" value={code} spellCheck={false} autoCapitalize="off" autoCorrect="off" onChange={(e) => setCode(e.target.value)} />
            </label>
            <div className="m-btn-row" style={{ padding: 0 }}>
              <button type="button" className="m-btn sec" onClick={() => dismiss()}>{t('mobile.pair.cancel')}</button>
              <button type="button" className="m-btn" disabled={!code.trim().startsWith('np1:')} onClick={() => dismiss(() => void pairWith(code))}>{t('mobile.pair.pairAction')}</button>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
