import { detectProviders, type Assignments, type PresetId, type ProviderEntry, type Registry } from '@newpaper/pipeline';
import {
  chooserRows,
  listable,
  money,
  segmentOf,
  SEGMENTS,
  stepCosts,
  tagsOf,
  usdFormatter,
  WIZARD_NAME,
  type Segment,
  type TestResult,
} from '@newpaper/ui-kit/logic';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { getRegistry } from '../ai/pipeline';
import { ipc } from '../ipc';
import { go } from '../router';
import { Bar } from './Bar';
import { ProviderLogo } from '../providers/Logo';
import { markConnected, runTest, storeKey, testModel } from '../providers/connect';
import { useI18n } from '@newpaper/i18n/react';

type Step = 'home' | 'all' | 'key' | 'local' | 'test' | 'start' | 'done';
type Phase = 'idle' | 'running' | 'ok' | 'fail';
const PRESETS: PresetId[] = ['privacy', 'balanced', 'quality', 'cheap'];
/** Los tres recomendados de la primera pantalla (mockup Movil-Proveedor, paso 1). */
const RECOMMENDED = ['google', 'openrouter', 'ollama'];
const LOCAL_PORT = 11434;

/**
 * Conectar un proveedor (Movil-Proveedor). Mismo flujo que el asistente de escritorio: elegir → clave o PC → prueba
 * real con errores honestos → punto de partida (`autoAssign`) con límite mensual → listo. El inicio de sesión con
 * OAuth (OpenRouter) y los servidores propios no están aún en el móvil.
 */
export function Provider() {
  const { t, locale } = useI18n();
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [step, setStep] = useState<Step>('home');
  const [query, setQuery] = useState('');
  const [segment, setSegment] = useState<Segment>('open');
  const [typed, setTyped] = useState('');
  const [chosen, setChosen] = useState<ProviderEntry | null>(null);
  const [key, setKey] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<TestResult | null>(null);
  const [slow, setSlow] = useState(false);
  const [preset, setPreset] = useState<PresetId>('balanced');
  const [limit, setLimit] = useState(0);
  const [pc, setPc] = useState<{ base: string; models: string[] } | null>(null);
  const [pcChecked, setPcChecked] = useState(false);
  const [assignments, setAssignments] = useState<Assignments | null>(null);

  useEffect(() => {
    void getRegistry().then(setRegistry);
    void ipc.settingsGet<number>('ai.monthlyLimitUsd').then((v) => typeof v === 'number' && setLimit(v));
  }, []);

  const found = useMemo(() => (registry && typed.trim().length >= 4 ? detectProviders(typed.trim(), registry) : []), [registry, typed]);
  const recommended = useMemo(() => (registry ? RECOMMENDED.map((id) => registry.get(id)).filter((p): p is ProviderEntry => !!p) : []), [registry]);
  const rows = useMemo(() => (registry ? chooserRows(registry.providers, { query, segment, nameOf: (p) => WIZARD_NAME[p.id] ?? p.name }) : []), [registry, query, segment]);
  const fmt = useMemo(() => usdFormatter(locale), [locale]);

  if (!registry) return null;
  const name = (p: ProviderEntry) => WIZARD_NAME[p.id] ?? p.name;

  /** Elige un proveedor: el PC (Ollama) va por emparejamiento; el resto pide clave. */
  const pick = async (p: ProviderEntry) => {
    setChosen(p);
    setKey('');
    setPhase('idle');
    setResult(null);
    if (p.type === 'local') {
      setStep('local');
      setPcChecked(false);
      setPc(await probePc());
      setPcChecked(true);
      return;
    }
    setStep('key');
  };

  /** Busca el Ollama de los equipos emparejados (mismo puerto que el escritorio). */
  const probePc = async () => {
    const peers = await ipc.syncPeers().catch(() => []);
    for (const peer of peers) {
      for (const addr of peer.addresses) {
        const host = addr.split(':')[0];
        try {
          const r = await ipc.ollamaProbe(`http://${host}:${LOCAL_PORT}`);
          return { base: r.base, models: r.models };
        } catch {
          /* este equipo no comparte su Ollama */
        }
      }
    }
    return null;
  };

  const runPrueba = async (p: ProviderEntry) => {
    setStep('test');
    setPhase('running');
    setSlow(false);
    setResult(null);
    const slowTimer = window.setTimeout(() => setSlow(true), 3000);
    try {
      if (p.type === 'cloud') await storeKey(p, key);
      const live = pc && p.type === 'local' ? pc.models : null;
      const r = await runTest(p, testModel(p, live));
      setResult(r);
      setPhase(r.ok ? 'ok' : 'fail');
    } finally {
      window.clearTimeout(slowTimer);
    }
  };

  const connect = async () => {
    if (!chosen) return;
    if (chosen.type === 'local' && pc) {
      await ipc.usePcOllama(pc.base);
    }
    const localModels = chosen.type === 'local' && pc ? { [chosen.id]: pc.models } : {};
    const a = await markConnected(chosen, preset, localModels);
    await ipc.settingsSet('ai.monthlyLimitUsd', limit > 0 ? limit : null);
    setAssignments(a);
    setStep('done');
  };

  /** Coste de un análisis con las asignaciones elegidas (suma de los pasos con precio conocido). */
  const costLabel = () => {
    if (!assignments) return '';
    const total = Object.values(stepCosts(registry, assignments)).reduce<number>((s, v) => s + (typeof v === 'number' ? v : 0), 0);
    return money(total, fmt, t('providers.free'), { approx: true });
  };

  const back = () => {
    if (step === 'all') return setStep('home');
    if (step === 'key' || step === 'local') return setStep(step === 'key' && query ? 'all' : 'home');
    if (step === 'test') return setStep(chosen?.type === 'local' ? 'local' : 'key');
    if (step === 'start') return setStep(chosen?.type === 'local' ? 'local' : 'test');
    if (step === 'done') return go('ia');
    return go('ajustes');
  };

  if (step === 'home') {
    return (
      <section>
        <Bar title={t('providers.title')} onBack={() => go('ia')} />
        <p className="m-sub">{t('providers.subtitle')}</p>
        <h2 className="m-sec">{t('providers.pickTitle')}</h2>
        <div className="m-group">
          {recommended.map((p) => (
            <button key={p.id} type="button" className="m-row" onClick={() => void pick(p)}>
              <ProviderLogo id={p.id} />
              <span className="m-row-body">
                <b>{name(p)}</b>
                <span>{t(`providers.pitch.${p.id}`)}</span>
                <span className="m-tags">
                  {tagsOf(p).map((g) => <i key={g}>{t(`providers.tag.${g}`)}</i>)}
                </span>
              </span>
            </button>
          ))}
        </div>
        <label className="m-field">
          <span>{t('providers.pasteKey')}</span>
          <input className="m-input" type="password" autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>
        {typed.trim().length >= 4 && found.length === 1 ? (
          <div className="m-btn-row" style={{ flexDirection: 'column' }}>
            <p className="m-hint m-ok">{t('providers.detected', { name: name(found[0]!) })}</p>
            <button type="button" className="m-btn" onClick={() => { setChosen(found[0]!); setKey(typed.trim()); setStep('key'); }}>
              {t('providers.connect', { name: name(found[0]!) })}
            </button>
          </div>
        ) : null}
        {typed.trim().length >= 4 && found.length === 0 ? <p className="m-hint m-bad">{t('providers.unknownPrefix')}</p> : null}
        <div className="m-btn-row" style={{ marginTop: 14 }}>
          <button type="button" className="m-btn sec" onClick={() => setStep('all')}>
            {t('providers.seeAll', { n: listable(registry.providers).length })}
          </button>
        </div>
      </section>
    );
  }

  if (step === 'all') {
    return (
      <section>
        <Bar title={t('providers.all.title')} onBack={back} />
        <label className="m-search">
          <input value={query} placeholder={t('providers.all.search')} onChange={(e) => setQuery(e.target.value)} aria-label={t('providers.all.search')} />
        </label>
        <div className={`m-seg m-seg-3${query ? ' dim' : ''}`} role="tablist" aria-label={t('providers.all.title')} style={{ marginTop: 12 }}>
          {SEGMENTS.map((s) => (
            <button key={s} type="button" role="tab" aria-selected={segment === s} onClick={() => setSegment(s)}>
              {t(`mobile.provider.seg.${s}`)}
            </button>
          ))}
        </div>
        <p className="m-hint">{t(`mobile.provider.segHint.${segment}`)}</p>
        <div className="m-group">
          {segment === 'open' && !query ? (
            <div className="m-row m-soon" aria-disabled="true">
              <ProviderLogo id="newrouter" />
              <span className="m-row-body">
                <b>{t('mobile.provider.newRouter')}</b>
                <span>{t('providers.soon.newrouter')}</span>
              </span>
              <span className="m-pill">{t('providers.soon.badge')}</span>
            </div>
          ) : null}
          {rows.map((p) => (
            <button key={p.id} type="button" className="m-row" onClick={() => void pick(p)}>
              <ProviderLogo id={p.id} />
              <span className="m-row-body">
                <b>{name(p)}</b>
                <span>{t(`providers.hint.${p.id}`)}</span>
                <span className="m-tags">{tagsOf(p).map((g) => <i key={g}>{t(`providers.tag.${g}`)}</i>)}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  if (step === 'key' && chosen) {
    const needsKey = chosen.type === 'cloud';
    return (
      <section>
        <Bar title={name(chosen)} onBack={back} />
        <div className="m-card" style={{ marginTop: 8 }}>
          <div className="m-card-head">
            <ProviderLogo id={chosen.id} />
            <span>
              <b>{name(chosen)}</b>
              <span className="m-muted">{t(`providers.hint.${chosen.id}`)}</span>
            </span>
          </div>
        </div>
        {needsKey ? (
          <label className="m-field">
            <span>{t('providers.key')}</span>
            <input className="m-input" type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} />
          </label>
        ) : null}
        <p className="m-hint">{needsKey ? t('providers.keyStorage', { name: name(chosen) }) : t('mobile.provider.localNote')}</p>
        <div className="m-btn-row" style={{ flexDirection: 'column', marginTop: 14 }}>
          <button type="button" className="m-btn" disabled={needsKey && key.trim().length < 4} onClick={() => void runPrueba(chosen)}>
            {t('providers.test')}
          </button>
        </div>
      </section>
    );
  }

  if (step === 'local' && chosen) {
    return (
      <section>
        <Bar title={name(chosen)} onBack={back} />
        {pc ? (
          <div className="m-card" style={{ marginTop: 8 }}>
            <b>{t('mobile.provider.pcDetected')}</b>
            <span className="m-muted">{t('mobile.provider.pcModels', { n: pc.models.length, base: pc.base.replace(/^https?:\/\//, '') })}</span>
            <div className="m-btn-row" style={{ padding: 0, marginTop: 12 }}>
              <button type="button" className="m-btn" onClick={() => setStep('start')}>{t('mobile.provider.pcUse')}</button>
            </div>
          </div>
        ) : pcChecked ? (
          <div className="m-state">
            <p>{t('mobile.provider.pcMissing')}</p>
            <div className="m-btn-row" style={{ flexDirection: 'column', marginTop: 12 }}>
              <button type="button" className="m-btn" onClick={() => go('emparejar')}>{t('mobile.provider.pairPc')}</button>
            </div>
            <p className="m-hint">{t('mobile.pair.ollamaHint')}</p>
          </div>
        ) : null}
      </section>
    );
  }

  if (step === 'test' && chosen) {
    return (
      <section>
        <Bar title={name(chosen)} onBack={back} />
        <div className="m-state" role="status" aria-live="polite">
          {phase === 'running' ? (
            <>
              <p className="m-pulse-text">{t('providers.testing')}</p>
              {slow ? <p className="m-hint">{t('mobile.provider.slow')}</p> : null}
            </>
          ) : null}
          {phase === 'ok' && result ? (
            <>
              <span className="m-check" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </span>
              <h2>{t('providers.testOk', { ms: result.latencyMs })}</h2>
            </>
          ) : null}
          {phase === 'fail' && result ? (
            <>
              <h2>{t('providers.failTitle', { name: name(chosen) })}</h2>
              <p role="alert" className="m-hint m-bad">{t('providers.testFail', { message: result.error ?? '' })}</p>
            </>
          ) : null}
        </div>
        {phase === 'ok' ? (
          <div className="m-btn-row" style={{ flexDirection: 'column' }}>
            <button type="button" className="m-btn" onClick={() => setStep('start')}>{t('mobile.provider.continue')}</button>
          </div>
        ) : null}
        {phase === 'fail' ? (
          <div className="m-btn-row" style={{ flexDirection: 'column' }}>
            <button type="button" className="m-btn" onClick={() => void runPrueba(chosen)}>{t('providers.retry')}</button>
            <button type="button" className="m-btn sec" onClick={() => setStep('key')}>{t('mobile.provider.changeKey')}</button>
          </div>
        ) : null}
      </section>
    );
  }

  if (step === 'start' && chosen) {
    return (
      <section>
        <Bar title={t('providers.preset.label')} onBack={back} />
        <div className="m-group" role="radiogroup" aria-label={t('providers.preset.label')} style={{ marginTop: 8 }}>
          {PRESETS.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={preset === p} className="m-row m-radio-row" onClick={() => setPreset(p)}>
              <span className="m-row-body">
                <b>{t(`providers.preset.${p}`)}</b>
                <span>{t(`providers.presetHint.${p}`)}</span>
              </span>
              <span className="m-radio-dot" aria-hidden="true" />
            </button>
          ))}
        </div>
        <h2 className="m-sec">{t('providers.budget')}</h2>
        <div className="m-card" style={{ margin: '0 var(--m-gutter)' }}>
          <label className="m-slider-label">
            <span>{t('providers.limit')}</span>
            <b className="np-mono">{limit > 0 ? fmt(limit) : t('mobile.provider.noLimit')}</b>
          </label>
          <input type="range" min={0} max={50} step={1} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="m-slider" aria-label={t('providers.limit')} style={{ '--v': `${(limit / 50) * 100}%` } as CSSProperties} />
          <p className="m-hint">{t('providers.limitHint')}</p>
        </div>
        <div className="m-btn-row" style={{ flexDirection: 'column', marginTop: 16 }}>
          <button type="button" className="m-btn" onClick={() => void connect()}>{t('providers.connect', { name: name(chosen) })}</button>
        </div>
      </section>
    );
  }

  if (step === 'done' && chosen) {
    return (
      <section>
        <div className="m-state">
          <span className="m-check" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          <h2>{t('providers.doneTitle', { name: name(chosen) })}</h2>
          <p>{t('providers.doneSub', { cost: costLabel() })}</p>
        </div>
        <div className="m-btn-row" style={{ flexDirection: 'column', marginTop: 16 }}>
          <button type="button" className="m-btn" onClick={() => go('ia')}>{t('mobile.provider.backToIa')}</button>
          <button type="button" className="m-btn sec" onClick={() => { setChosen(null); setKey(''); setTyped(''); setStep('home'); }}>{t('providers.another')}</button>
        </div>
      </section>
    );
  }

  return null;
}
