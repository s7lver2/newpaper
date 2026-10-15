import { Bar } from './Bar';
import { useI18n } from '@newpaper/i18n/react';
import { cancel, checkPermissions, Format, openAppSettings, requestPermissions, scan } from '@tauri-apps/plugin-barcode-scanner';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { resetPipeline } from '../ai/pipeline';
import { ipc, type OllamaProbe, type PeerView } from '../ipc';
import { go, useBackClose } from '../router';
import { barsOverDark } from '../theme';

type View = 'intro' | 'scan' | 'manual' | 'denied' | 'busy' | 'done';

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

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Emparejar con el PC: introducción, escáner QR a pantalla completa (cámara real del plugin, en ventana), código a mano y resultado. */
export function Pair() {
  const { t } = useI18n();
  const [view, setView] = useState<View>('intro');
  const [code, setCode] = useState('');
  const [peer, setPeer] = useState<PeerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ollama, setOllama] = useState<OllamaProbe | null>(null);
  const scanning = useRef(false);

  const layer = view === 'scan' || view === 'manual' || view === 'denied';
  const dismiss = useBackClose(layer, () => {
    if (scanning.current) void cancel().catch(() => {});
    scanning.current = false;
    setView('intro');
  });

  const pairWith = async (c: string) => {
    setView('busy');
    setError(null);
    setOllama(null);
    try {
      const p = await ipc.syncPairWith(c.trim());
      setPeer(p);
      for (const addr of p.addresses) {
        const host = addr.split(':')[0];
        try {
          setOllama(await ipc.ollamaProbe(`http://${host}:11434`));
          break;
        } catch {
          /* este PC no comparte su Ollama en esta direccion */
        }
      }
      setView('done');
    } catch (e) {
      setError(t('mobile.pair.failed', { message: String((e as { message?: string }).message ?? e) }));
      setView('intro');
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
          <b /><b /><b /><b />
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
                  go('ajustes');
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
        <svg viewBox="0 0 280 110" width="100%" height="110">
          <rect x="30" y="14" width="130" height="74" rx="9" fill="var(--np-card)" stroke="var(--np-line3)" strokeWidth="1.5" />
          <path d="M80 98h30M95 88v10" stroke="var(--np-line3)" strokeWidth="1.5" strokeLinecap="round" />
          <g fill="var(--np-ink)"><rect x="78" y="30" width="12" height="12" rx="2" /><rect x="100" y="30" width="12" height="12" rx="2" /><rect x="78" y="52" width="12" height="12" rx="2" /><rect x="100" y="56" width="6" height="6" /><rect x="110" y="48" width="6" height="6" /></g>
          <path d="M170 52c10-4 22 0 30 4" stroke="var(--np-accent)" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 7" fill="none" />
          <rect x="206" y="22" width="44" height="76" rx="9" fill="var(--np-card)" stroke="var(--np-ink)" strokeWidth="1.8" />
          <rect x="216" y="44" width="24" height="24" rx="5" fill="none" stroke="var(--np-accent)" strokeWidth="1.8" />
        </svg>
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
        <button type="button" className="m-btn" disabled={view === 'busy'} onClick={() => void startScan()}>{view === 'busy' ? t('mobile.pair.pairing') : t('mobile.pair.scan')}</button>
        <button type="button" className="m-btn sec" disabled={view === 'busy'} onClick={() => setView('manual')}>{t('mobile.pair.manual')}</button>
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
