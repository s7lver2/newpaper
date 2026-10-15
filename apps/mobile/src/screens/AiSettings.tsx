import { useI18n } from '@newpaper/i18n/react';
import { type PresetId, type ProviderEntry, type Registry } from '@newpaper/pipeline';
import { usdFormatter, WIZARD_NAME, type TestResult } from '@newpaper/ui-kit/logic';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { getRegistry } from '../ai/pipeline';
import { ProviderLogo } from '../providers/Logo';
import { applyAssignments, connectedIds, disconnect, forgetKey, runTest, testModel } from '../providers/connect';
import { ipc } from '../ipc';
import { go } from '../router';
import { Bar } from './Bar';

const PRESETS: PresetId[] = ['privacy', 'balanced', 'quality', 'cheap'];
/** Tiempo de «Deshacer» antes de borrar la clave del llavero (mockup M20: 4,5 s). */
const UNDO_MS = 4500;

interface Pending { id: string; name: string; timer: number }

/**
 * IA y proveedores (Movil-IA): resumen, proveedores conectados con su estado, prueba, desconexión con «Deshacer» y
 * punto de partida con límite mensual. Lo mismo que Ajustes › IA de escritorio, sin la parte de cuentas.
 */
export function AiSettings() {
  const { t, locale } = useI18n();
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [connected, setConnected] = useState<string[]>([]);
  const [preset, setPreset] = useState<PresetId>('balanced');
  const [limit, setLimit] = useState(0);
  const [open, setOpen] = useState<ProviderEntry | null>(null);
  const [probe, setProbe] = useState<{ phase: 'idle' | 'running' | 'done'; result: TestResult | null }>({ phase: 'idle', result: null });
  const [confirm, setConfirm] = useState<ProviderEntry | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;

  const load = async () => {
    setConnected(await connectedIds());
    setPreset(((await ipc.settingsGet<PresetId>('ai.preset')) ?? 'balanced') as PresetId);
    const lim = await ipc.settingsGet<number>('ai.monthlyLimitUsd');
    setLimit(typeof lim === 'number' ? lim : 0);
  };
  useEffect(() => {
    void getRegistry().then(setRegistry);
    void load();
    return () => {
      // Al salir, un borrado pendiente se completa: el usuario ya no puede deshacerlo desde esta pantalla.
      if (pendingRef.current) {
        window.clearTimeout(pendingRef.current.timer);
        void forgetKey(pendingRef.current.id);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fmt = useMemo(() => usdFormatter(locale), [locale]);
  const providers = useMemo(() => (registry ? connected.map((id) => registry.get(id)).filter((p): p is ProviderEntry => !!p) : []), [registry, connected]);
  const name = (p: ProviderEntry) => WIZARD_NAME[p.id] ?? p.name;

  const changePreset = async (p: PresetId) => {
    setPreset(p);
    if (connected.length) await applyAssignments(connected, p);
    else await ipc.settingsSet('ai.preset', p);
  };

  const saveLimit = (v: number) => {
    setLimit(v);
    void ipc.settingsSet('ai.monthlyLimitUsd', v > 0 ? v : null);
  };

  const runProbe = async (p: ProviderEntry) => {
    setProbe({ phase: 'running', result: null });
    const r = await runTest(p, testModel(p));
    setProbe({ phase: 'done', result: r });
  };

  const doDisconnect = async (p: ProviderEntry) => {
    setConfirm(null);
    setOpen(null);
    if (pending) {
      window.clearTimeout(pending.timer);
      void forgetKey(pending.id);
    }
    await disconnect(p.id, preset);
    const timer = window.setTimeout(() => {
      void forgetKey(p.id);
      setPending(null);
    }, UNDO_MS);
    setPending({ id: p.id, name: name(p), timer });
    await load();
  };

  const undo = async () => {
    if (!pending) return;
    window.clearTimeout(pending.timer);
    const restored = [...new Set([...(await connectedIds()), pending.id])];
    await ipc.settingsSet('ai.connected', restored);
    await applyAssignments(restored, preset);
    setPending(null);
    await load();
  };

  if (!registry) return null;

  return (
    <section>
      <Bar title={t('mobile.ia.title')} onBack={() => go('ajustes')} />
      <p className="m-sub">{t('mobile.ia.lead')}</p>

      <div className="m-card m-summary">
        <span className="m-kicker">{t('mobile.ia.summaryKicker')}</span>
        <b>{providers.length ? t('mobile.ia.connectedCount', { n: providers.length }) : t('mobile.ia.none')}</b>
        <span className="m-muted">{t(`providers.preset.${preset}`)} · {t(`providers.presetHint.${preset}`)}</span>
      </div>

      <h2 className="m-sec">{t('providers.connected')}</h2>
      {providers.length === 0 ? (
        <div className="m-state">
          <p>{t('providers.noneConnected')}</p>
          <div className="m-btn-row" style={{ flexDirection: 'column', marginTop: 12 }}>
            <button type="button" className="m-btn" onClick={() => go('proveedor')}>{t('providers.connectOne')}</button>
          </div>
        </div>
      ) : (
        <div className="m-group">
          {providers.map((p) => (
            <button key={p.id} type="button" className="m-row" onClick={() => { setOpen(p); setProbe({ phase: 'idle', result: null }); }}>
              <ProviderLogo id={p.id} />
              <span className="m-row-body">
                <b>{name(p)}</b>
                <span>{p.type === 'local' ? t('mobile.ia.statusLocal') : t('mobile.ia.statusConnected')}</span>
              </span>
              <span className="m-chev" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      )}
      {providers.length > 0 ? (
        <div className="m-btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="m-btn sec" onClick={() => go('proveedor')}>{t('mobile.ia.add')}</button>
        </div>
      ) : null}

      <h2 className="m-sec">{t('providers.preset.label')}</h2>
      <div className="m-seg m-seg-4" role="radiogroup" aria-label={t('providers.preset.label')}>
        {PRESETS.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={preset === p} onClick={() => void changePreset(p)}>{t(`providers.preset.${p}`)}</button>
        ))}
      </div>
      <p className="m-hint" style={{ margin: '10px var(--m-gutter) 0' }}>{t(`providers.presetHint.${preset}`)}</p>

      <h2 className="m-sec">{t('providers.budget')}</h2>
      <div className="m-card" style={{ margin: '0 var(--m-gutter)' }}>
        <label className="m-slider-label">
          <span>{t('providers.limit')}</span>
          <b className="np-mono">{limit > 0 ? fmt(limit) : t('mobile.provider.noLimit')}</b>
        </label>
        <input type="range" min={0} max={50} step={1} value={limit} onChange={(e) => saveLimit(Number(e.target.value))} className="m-slider" aria-label={t('providers.limit')} style={{ '--v': `${(limit / 50) * 100}%` } as CSSProperties} />
        <p className="m-hint">{t('providers.limitHint')}</p>
      </div>

      {open ? (
        <>
          <div className="m-scrim" onClick={() => setOpen(null)} aria-hidden="true" />
          <div className="m-sheet" role="dialog" aria-modal="true" aria-label={name(open)}>
            <div className="m-grab" />
            <div className="m-card-head">
              <ProviderLogo id={open.id} />
              <span>
                <b className="m-title-sm">{name(open)}</b>
              </span>
            </div>
            {probe.phase === 'running' ? <p className="m-hint">{t('providers.testing')}</p> : null}
            {probe.phase === 'done' && probe.result?.ok ? <p role="status" className="m-hint m-ok">{t('providers.testOk', { ms: probe.result.latencyMs })}</p> : null}
            {probe.phase === 'done' && probe.result && !probe.result.ok ? <p role="alert" className="m-hint m-bad">{t('providers.testFail', { message: probe.result.error ?? '' })}</p> : null}
            <div className="m-btn-row" style={{ flexDirection: 'column', padding: 0, marginTop: 12 }}>
              <button type="button" className="m-btn" disabled={probe.phase === 'running'} onClick={() => void runProbe(open)}>{t('providers.test')}</button>
              <button type="button" className="m-btn danger" onClick={() => setConfirm(open)}>{t('providers.disconnect')}</button>
            </div>
          </div>
        </>
      ) : null}

      {confirm ? (
        <>
          <div className="m-scrim" onClick={() => setConfirm(null)} aria-hidden="true" />
          <div className="m-sheet" role="alertdialog" aria-modal="true" aria-label={t('mobile.ia.confirmTitle', { name: name(confirm) })}>
            <div className="m-grab" />
            <h2 className="m-title-sm">{t('mobile.ia.confirmTitle', { name: name(confirm) })}</h2>
            <p className="m-muted" style={{ margin: '8px 0 16px' }}>{t('mobile.ia.confirmBody')}</p>
            <div className="m-btn-row" style={{ padding: 0 }}>
              <button type="button" className="m-btn sec" onClick={() => setConfirm(null)}>{t('mobile.settings.confirmCancel')}</button>
              <button type="button" className="m-btn danger" onClick={() => void doDisconnect(confirm)}>{t('providers.disconnect')}</button>
            </div>
          </div>
        </>
      ) : null}

      {pending ? (
        <div className="m-toast" role="status">
          <span>{t('mobile.ia.disconnected', { name: pending.name })}</span>
          <button type="button" className="m-toast-act" onClick={() => void undo()}>{t('mobile.ia.undo')}</button>
        </div>
      ) : null}
    </section>
  );
}
