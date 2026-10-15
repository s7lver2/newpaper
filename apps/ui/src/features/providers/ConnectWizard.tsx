import { useI18n } from '@newpaper/i18n/react';
import { autoAssign, describeAssignment, detectProviders, type Assignments, type ProviderEntry, type Registry } from '@newpaper/pipeline';
import { useEffect, useMemo, useRef, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { LocalProbe } from '../../ipc/types';
import { navigate } from '../../shell/navigate';
import { getRegistry, resetPipeline, useAiSettings } from '../ai/pipeline';
import { money, stepCosts, STEPS, useUsd, WIZARD_NAME } from './aiModel';
import { DEFAULT_CUSTOM, errorText, firstModel, markConnected, runConnectionTest, storeCredentials, type CustomDraft } from './connect';
import { groupOf, metaOf } from './providerMeta';
import { ProviderLogo } from './ProviderLogo';

type Step = 1 | 2 | 3;
type Closed = null | 'done' | 'cancelled';
type LoginState = { phase: 'idle' } | { phase: 'waiting'; url: string | null; opened: boolean; copied: boolean } | { phase: 'error'; code: string; message: string };
interface TestState { phase: number; failed: boolean; ok: boolean; latencyMs: number; error: string | null }
const IDLE: TestState = { phase: 0, failed: false, ok: false, latencyMs: 0, error: null };
/** Las seis filas del resumen del paso 3 (el mockup las numera 01–06). */
const TASKS = STEPS.filter((s) => ['extract', 'claims', 'verify', 'score', 'synthesis', 'agent'].includes(s.id));
/** Proveedores con una nota extra en la columna «¿No tienes clave?» (mockup `tip`). */
const TIPS = new Set(['openai', 'google']);
const KEY_EXAMPLES = 'sk-…, sk-ant-…, nvapi-…, AIza…';
const MODEL_EXAMPLES = 'llama3, mistral…';

const Check = ({ size = 16, width = 2.4 }: { size?: number; width?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
const Arrow = ({ cls }: { cls?: string }) => (
  <svg className={cls} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

export function ConnectWizard({ onDone }: { onDone(): void }) {
  const { t } = useI18n();
  const fmt = useUsd();
  const ai = useAiSettings();
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [local, setLocal] = useState<LocalProbe>({ ollama: null, lmstudio: null });
  const [step, setStep] = useState<Step>(1);
  const [dir, setDir] = useState<'f' | 'b'>('f');
  const [closed, setClosed] = useState<Closed>(null);
  const [provider, setProvider] = useState<ProviderEntry | null>(null);
  /** La clave solo vive aquí hasta que se guarda en el llavero (al probar); después se vacía. */
  const [key, setKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  // El endpoint propio solo tiene dirección y modelos (CustomEndpoint de Rust): sin nombre visible.
  const [custom, setCustom] = useState<CustomDraft>(DEFAULT_CUSTOM);
  const [bump, setBump] = useState(0);
  const [opened, setOpened] = useState(false);
  const [adv, setAdv] = useState(false);
  const [test, setTest] = useState<TestState>(IDLE);
  const [login, setLogin] = useState<LoginState>({ phase: 'idle' });
  const timers = useRef<number[]>([]);
  /** Proveedor cuya clave está en el llavero sin que el asistente haya terminado: se borra si se abandona. */
  const pending = useRef<string | null>(null);
  /** Proveedor con un inicio de sesión en curso (para cancelarlo al salir del paso). */
  const loginFor = useRef<string | null>(null);
  const keyInput = useRef<HTMLInputElement>(null);
  /** Escape: un paso atrás (o cerrar en el primero). Se renueva en cada render para ver el estado actual. */
  const escape = useRef<() => void>(() => {});

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  const dropPending = () => {
    const id = pending.current;
    pending.current = null;
    if (id) void commands.secretDelete(`ai.${id}`).catch(() => {});
  };

  useEffect(() => {
    // Escape vale con el foco en el asistente o en la página (no cuando se escribe en la barra de direcciones).
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (e.key !== 'Escape' || e.defaultPrevented || (target !== document.body && !target?.closest('.np-wz'))) return;
      escape.current();
    };
    document.addEventListener('keydown', onKey);
    void getRegistry().then(setRegistry);
    void commands.aiLocalProbe().then(setLocal).catch(() => {});
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimers();
      dropPending();
      if (loginFor.current) void commands.aiLoginCancel(loginFor.current).catch(() => {});
    };
  }, []);

  const detected = useMemo(() => (registry && key.trim().length >= 4 ? detectProviders(key.trim(), registry) : []), [registry, key]);
  const localModels = (p: ProviderEntry) => (p.id === 'ollama' ? local.ollama : p.id === 'lmstudio' ? local.lmstudio : null);
  const isLocalP = (p: ProviderEntry) => p.type === 'local';

  // En el paso 2, una clave que es claramente de otro proveedor cambia de proveedor (el logo rebota, como en el mockup).
  useEffect(() => {
    if (step !== 2 || !provider || provider.id === 'custom' || detected.length !== 1) return;
    const only = detected[0]!;
    if (only.id !== provider.id && only.type === 'cloud') {
      setProvider(only);
      setBump((b) => b + 1);
    }
  }, [detected, step, provider]);

  // Al entrar en el paso 2, el cursor va al primer campo.
  const isCustomNow = provider?.id === 'custom';
  useEffect(() => {
    if (step === 2) keyInput.current?.focus({ preventScroll: true });
  }, [step, isCustomNow]);

  if (!registry) return <p className="np-panel-empty" aria-busy="true">{t('providers.loading')}</p>;

  const name = (p: ProviderEntry) => (p.id === 'custom' ? t('providers.customTitle') : (WIZARD_NAME[p.id] ?? p.name));
  const free = t('providers.free');

  const go = (to: Step, d: 'f' | 'b') => {
    setDir(d);
    setStep(to);
  };
  const resetTest = () => {
    clearTimers();
    setTest(IDLE);
  };

  const startTest = async (p: ProviderEntry) => {
    clearTimers();
    go(3, 'f');
    setAdv(false);
    setTest(IDLE);
    const t0 = performance.now();
    try {
      await storeCredentials(p, key, custom, keySaved);
      if (key.trim()) {
        pending.current = ai.connected.includes(p.id) ? null : p.id;
        setKey('');
        setKeySaved(true);
      }
    } catch (e) {
      setTest({ ...IDLE, failed: true, error: errorText(e) });
      return;
    }
    const r = await runConnectionTest(p, firstModel(p, custom, localModels(p)));
    if (!r.ok) {
      setTest({ ...IDLE, failed: true, latencyMs: r.latencyMs, error: r.error });
      return;
    }
    // Una sola llamada real; sus tres comprobaciones se revelan una a una, como en el mockup.
    const wait = Math.max(0, 600 - (performance.now() - t0));
    const at = (ms: number, phase: number) => timers.current.push(window.setTimeout(() => setTest({ ...IDLE, phase, ok: phase >= 4, latencyMs: r.latencyMs }), ms));
    at(wait, 1);
    at(wait + 700, 2);
    at(wait + 1600, 3);
    at(wait + 2200, 4);
  };

  /** «Iniciar sesión con X»: Rust abre el navegador, espera y guarda la clave en el llavero. Aquí solo hay estados. */
  const startLogin = async (p: ProviderEntry) => {
    if (login.phase === 'waiting') return;
    loginFor.current = p.id;
    setLogin({ phase: 'waiting', url: null, opened: false, copied: false });
    try {
      await commands.aiLogin(p.id, (url, opened) => setLogin((l) => (l.phase === 'waiting' ? { ...l, url, opened } : l)));
    } catch (e) {
      loginFor.current = null;
      const err = e as { code?: string; message?: string };
      // Cancelar no es un error: se vuelve a la elección.
      setLogin(err?.code === 'cancelled' ? { phase: 'idle' } : { phase: 'error', code: err?.code ?? 'login_failed', message: errorText(e) });
      return;
    }
    loginFor.current = null;
    setLogin({ phase: 'idle' });
    // La clave ya está en el llavero: se prueba y, si el asistente se abandona, se borra como una clave pegada.
    pending.current = ai.connected.includes(p.id) ? null : p.id;
    setKeySaved(true);
    void startTest(p);
  };
  const abortLogin = () => {
    if (loginFor.current) void commands.aiLoginCancel(loginFor.current).catch(() => {});
    loginFor.current = null;
    setLogin({ phase: 'idle' });
  };

  const choose = (p: ProviderEntry) => {
    abortLogin();
    if (pending.current && pending.current !== p.id) dropPending();
    setProvider(p);
    resetTest();
    setOpened(false);
    setBump((b) => b + 1);
    if (isLocalP(p)) {
      setKeySaved(false);
      void startTest(p);
      return;
    }
    // Una clave pegada en el paso 1 se conserva solo si es de este proveedor.
    if (!detected.some((d) => d.id === p.id)) setKey('');
    setKeySaved(false);
    go(2, 'f');
  };

  const back = () => {
    abortLogin();
    resetTest();
    if (step === 3 && provider && isLocalP(provider)) go(1, 'b');
    else go((step - 1) as Step, 'b');
  };

  const close = () => {
    abortLogin();
    clearTimers();
    dropPending();
    setKey('');
    setClosed('cancelled');
  };

  const finish = async () => {
    if (!provider || !test.ok) return;
    await markConnected(ai, provider, custom);
    resetPipeline();
    pending.current = null;
    setClosed('done');
  };

  const restart = () => {
    setClosed(null);
    setProvider(null);
    setKey('');
    setKeySaved(false);
    setCustom(DEFAULT_CUSTOM);
    resetTest();
    setOpened(false);
    go(1, 'b');
  };

  escape.current = () => {
    if (closed) return;
    if (step === 1) close();
    else back();
  };

  // ---- Resumen del paso 3 y de la tarjeta final (asignación automática con este proveedor ya incluido).
  const localMap = Object.fromEntries(Object.entries({ ollama: local.ollama, lmstudio: local.lmstudio }).filter(([, v]) => v?.length)) as Record<string, string[]>;
  const summary = () => {
    if (!provider) return null;
    const hasManual = Object.keys(ai.assignments).length > 0;
    const auto: Assignments = autoAssign(registry, [...new Set([...ai.connected, provider.id, ...Object.keys(localMap)])], ai.preset, localMap);
    let a: Assignments = hasManual ? ai.assignments : auto;
    if (provider.id === 'custom' && !Object.keys(a).length) {
      const ref = { provider: 'custom', model: firstModel(provider, custom, null) };
      a = { claims: ref, verify: ref, score: ref, synthesis: ref, agent: ref };
    }
    const list = describeAssignment(registry, a);
    const rows = Object.fromEntries(list.map((r) => [r.stage, r]));
    const costs = stepCosts(registry, a);
    const total = TASKS.reduce((n, s) => (s.stage && s.stage !== 'agent' ? n + (costs[s.stage] ?? 0) : n), 0);
    return { rows, costs, total, heavy: rows.verify ?? rows.synthesis, allLocal: list.length > 0 && list.every((r) => r.local) };
  };

  // ---- Tarjeta de cierre.
  if (closed) {
    const sm = closed === 'done' ? summary() : null;
    return (
      <div className="np-wz">
        <div className="np-wz-closed-wrap">
          <div className="np-wz-closed" role="status">
            <div className="np-wz-closed-logo">
              {provider ? <ProviderLogo id={provider.id} size={72} radius={20} mark={36} mono={26} /> : <ProviderLogo id="custom" size={72} radius={20} mono={26} />}
              {closed === 'done' ? <span className="np-wz-closed-badge"><Check size={13} width={3} /></span> : null}
            </div>
            <div className="np-wz-closed-title">{closed === 'done' && provider ? t('providers.doneTitle', { name: name(provider) }) : t('providers.closedTitle')}</div>
            <div className="np-wz-closed-sub">
              {closed === 'done' ? (sm?.allLocal ? t('providers.doneSubLocal') : t('providers.doneSub', { cost: money(sm?.total ?? 0, fmt, free).replace('~', '') })) : t('providers.closedSub')}
            </div>
            <div className="np-wz-closed-actions">
              <button type="button" className="np-wz-btn np-wz-btn--ghost" onClick={restart}>{t('providers.another')}</button>
              <button type="button" className="np-wz-btn np-wz-btn--solid" onClick={onDone}>{t('providers.backToSettings')}</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Cabecera y pasos.
  const steps = [
    { name: t('providers.steps.choose'), sub: t('providers.steps.chooseSub') },
    { name: t('providers.steps.key'), sub: t('providers.steps.keySub') },
    { name: t('providers.steps.test'), sub: t('providers.steps.testSub') },
  ];
  const header = (
    <>
      <div className="np-wz-head">
        <div>
          <h1 className="np-wz-title">{t('providers.title')}</h1>
          <p className="np-wz-sub">{t('providers.subtitle')}</p>
        </div>
        <button type="button" className="np-wz-close" aria-label={t('providers.close')} onClick={close}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <ol className="np-wz-steps" aria-label={t('providers.steps.label')}>
        <li className="np-wz-track" aria-hidden="true" />
        <li className="np-wz-trackfill" aria-hidden="true" style={{ width: `${((step - 1) * 33.33).toFixed(2)}%` }} />
        {steps.map((s, i) => {
          const n = i + 1;
          const done = step > n;
          const cur = step === n;
          return (
            <li key={n} className="np-wz-step" aria-current={cur ? 'step' : undefined} data-state={done ? 'done' : cur ? 'cur' : 'todo'}>
              <span className="np-wz-dot">{done ? <Check /> : <span>{n}</span>}</span>
              <span className="np-wz-steplabel">{s.name}</span>
              <span className="np-wz-stepsub">{s.sub}</span>
            </li>
          );
        })}
      </ol>
    </>
  );

  // ---- Paso 1: elegir.
  if (step === 1) {
    const byCat = (c: ProviderEntry['category']) => registry.providers.filter((p) => p.category === c);
    const rec = registry.recommended();
    // Abiertos = pesos abiertos (y los agregadores, que sirven de ambos); Cerrados = solo propietarios.
    const openCloud = byCat('cloud').filter((p) => groupOf(p) === 'open');
    const closedCloud = byCat('cloud').filter((p) => groupOf(p) === 'closed');
    const locals = byCat('local');
    const adv1 = byCat('advanced');
    const det1 = detected.length === 1 ? detected[0]! : null;
    const prefixOf = (p: ProviderEntry) => [...p.keyPrefixes].filter((x) => key.trim().startsWith(x)).sort((a, b) => b.length - a.length)[0] ?? '';
    return (
      <div className="np-wz">
        {header}
        <div className={`np-wz-pane np-wz-pane--${dir}`} key="s1">
          <h2 className="np-wz-eyebrow">{t('providers.cat.recommended')}</h2>
          <div className="np-wz-recs">
            {rec.map((p) => (
              <button key={p.id} type="button" className="np-wz-rec np-lift" onClick={() => choose(p)}>
                <span className="np-wz-rec-top">
                  <ProviderLogo id={p.id} size={56} radius={16} mark={30} mono={22} />
                  <span className="np-wz-tag">{t('providers.tag.recommended')}</span>
                </span>
                <span className="np-wz-rec-name">{name(p)}</span>
                <span className="np-wz-rec-pitch">{t(`providers.pitch.${p.id}`)}</span>
                <span className="np-wz-rec-desc">{t(`providers.desc.${p.id}`)}</span>
                <span className="np-wz-rec-go">{t('providers.connect', { name: name(p) })}<Arrow cls="np-wz-arr" /></span>
              </button>
            ))}
          </div>

          <div className="np-wz-paste">
            <label htmlFor="np-wz-k1" className="np-wz-paste-label">{t('providers.pasteKey')}</label>
            <div className="np-wz-paste-hint">{t('providers.pasteHint')}</div>
            <div className="np-wz-paste-row">
              <input
                id="np-wz-k1"
                className="np-wz-input np-wz-input--paste"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                placeholder={KEY_EXAMPLES}
                onChange={(e) => setKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && det1) choose(det1);
                }}
              />
              {det1 ? (
                <div className="np-wz-det">
                  <span key={`${det1.id}${bump % 2}`} className="np-wz-bnc" data-b={bump % 2}><ProviderLogo id={det1.id} size={36} radius={10} mark={20} mono={15} /></span>
                  <span className="np-wz-det-text">{t('providers.isOf')} <b>{name(det1)}</b></span>
                  <button type="button" className="np-wz-btn np-wz-btn--solid np-wz-btn--sm" onClick={() => choose(det1)}>{t('providers.continue')}</button>
                </div>
              ) : null}
            </div>
            {detected.length > 1 ? (
              <div className="np-wz-ambig np-rise">
                <span>{t('providers.ambiguous')}</span>
                {detected.map((p) => (
                  <button key={p.id} type="button" className="np-wz-chip" onClick={() => choose(p)}>
                    <ProviderLogo id={p.id} size={22} radius={7} mark={13} mono={10} />{name(p)}<span className="np-wz-chip-pfx">{prefixOf(p)}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {key.trim().length >= 4 && detected.length === 0 ? <div className="np-wz-warn np-rise" role="status">{t('providers.unknownPrefix')}</div> : null}
          </div>

          {[
            { id: 'open', list: openCloud },
            { id: 'closed', list: closedCloud },
          ].map((g, gi) => (
            <section key={g.id} aria-labelledby={`np-wz-g-${g.id}`}>
              <div className="np-wz-secthead"><h2 id={`np-wz-g-${g.id}`} className="np-wz-eyebrow">{t(`providers.cat.${g.id}`)}</h2><span className="np-wz-secthint">{t(`providers.cat.${g.id}Hint`)}</span></div>
              <div className="np-wz-tiles np-wz-tiles--cloud">
                {g.list.map((p, i) => (
                  <button key={p.id} type="button" className="np-wz-tile np-lift" style={{ animationDelay: `${120 + (gi * 7 + i) * 35}ms` }} onClick={() => choose(p)}>
                    <ProviderLogo id={p.id} size={40} radius={11} mark={22} mono={14} />
                    <span className="np-wz-tile-text"><span className="np-wz-tile-name">{name(p)}</span><span className="np-wz-tile-sub">{t(`providers.sub.${p.id}`)}</span></span>
                  </button>
                ))}
              </div>
            </section>
          ))}

          <div className="np-wz-lower">
            <div className="np-wz-lower-main">
              <div className="np-wz-secthead"><h2 className="np-wz-eyebrow">{t('providers.cat.local')}</h2><span className="np-wz-secthint">{t('providers.cat.localHint')}</span></div>
              <div className="np-wz-tiles np-wz-tiles--local">
                {locals.map((p, i) => {
                  const found = localModels(p);
                  return (
                    <button key={p.id} type="button" className="np-wz-tile np-lift" style={{ animationDelay: `${120 + (openCloud.length + closedCloud.length + i) * 35}ms` }} onClick={() => choose(p)}>
                      <ProviderLogo id={p.id} size={40} radius={11} mark={22} mono={14} />
                      <span className="np-wz-tile-text np-wz-tile-text--grow">
                        <span className="np-wz-tile-name">{name(p)}</span>
                        <span className="np-wz-tile-sub np-wz-tile-sub--wrap">{found?.length ? found.slice(0, 3).map((m) => registry.model(p.id, m)?.name ?? m).join(' · ') : t(`providers.sub.${p.id}`)}</span>
                      </span>
                      {found?.length ? <span className="np-wz-found"><span className="np-pulse np-wz-found-dot" />{t('providers.pill.detected')}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="np-wz-lower-side">
              <div className="np-wz-secthead"><h2 className="np-wz-eyebrow">{t('providers.cat.advanced')}</h2></div>
              {adv1.map((p) => (
                <button key={p.id} type="button" className="np-wz-tile np-wz-tile--wide np-lift" onClick={() => choose(p)}>
                  <ProviderLogo id={p.id} size={40} radius={11} mono={13} />
                  <span className="np-wz-tile-text"><span className="np-wz-tile-name">{name(p)}</span><span className="np-wz-tile-sub">{t('providers.customHint')}</span></span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Paso 2: clave.
  if (step === 2 && provider) {
    const isCustom = provider.id === 'custom';
    const meta = metaOf(provider.id);
    const keyOk = isCustom || key.trim().length >= 8 || keySaved;
    const hit = detected.find((p) => p.id === provider.id);
    const pfx = hit ? ([...hit.keyPrefixes].filter((x) => key.trim().startsWith(x)).sort((a, b) => b.length - a.length)[0] ?? '') : '';
    const how = isCustom
      ? [t('providers.howCustom.1'), t('providers.howCustom.2'), t('providers.howCustom.3')]
      : [t('providers.how.1', { site: meta.site ?? '' }), t('providers.how.2', { section: meta.section ?? '', button: meta.button ?? '' }), t('providers.how.3')];
    const runTest = () => {
      if (keyOk) void startTest(provider);
    };
    return (
      <div className="np-wz">
        {header}
        <div className={`np-wz-pane np-wz-pane--${dir}`} key="s2">
          <div className="np-wz-cols">
            <div className="np-wz-card np-wz-card--key">
              <div className="np-wz-keyhead">
                <span key={`${provider.id}${bump % 2}`} className="np-wz-bnc" data-b={bump % 2}><ProviderLogo id={provider.id} size={68} radius={18} mark={34} mono={24} /></span>
                <div className="np-wz-keyhead-text">
                  <div className="np-wz-keyname">{name(provider)}</div>
                  <div className="np-wz-keykind">{isCustom ? t('providers.kind.custom') : t('providers.kind.cloud')}</div>
                </div>
              </div>
              {provider.login?.status === 'available' ? (
                <div className="np-wz-login" data-phase={login.phase}>
                  {login.phase === 'waiting' ? (
                    <div className="np-wz-login-wait" role="status" aria-live="polite">
                      <span className="np-wz-spin" aria-hidden="true" />
                      <div className="np-wz-login-wait-text">
                        <div className="np-wz-login-wait-title">{t('providers.login.waiting', { name: name(provider) })}</div>
                        <div className="np-wz-login-wait-hint">{login.url && !login.opened ? t('providers.login.notOpened') : t('providers.login.waitingHint')}</div>
                      </div>
                      <div className="np-wz-login-wait-actions">
                        {login.url ? (
                          <button
                            type="button"
                            className="np-wz-btn np-wz-btn--ghost np-wz-btn--sm"
                            onClick={() => {
                              void navigator.clipboard?.writeText(login.url!).then(() => setLogin((l) => (l.phase === 'waiting' ? { ...l, copied: true } : l))).catch(() => {});
                            }}
                          >
                            {login.copied ? t('providers.login.copied') : t('providers.login.copy')}
                          </button>
                        ) : null}
                        <button type="button" className="np-wz-btn np-wz-btn--ghost np-wz-btn--sm" onClick={abortLogin}>{t('providers.login.cancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button type="button" className="np-wz-btn np-wz-btn--solid np-wz-login-btn" onClick={() => void startLogin(provider)}>
                        {login.phase === 'error' ? t('providers.login.retry') : t('providers.login.button', { name: name(provider) })}
                      </button>
                      <p className="np-wz-login-lead">{t('providers.login.lead', { name: name(provider) })}</p>
                      {login.phase === 'error' ? (
                        <div className="np-wz-warn np-wz-login-err np-rise" role="alert">
                          {login.code === 'login_timeout' ? t('providers.login.timeout') : login.code === 'login_denied' ? t('providers.login.denied', { name: name(provider) }) : t('providers.login.failed', { name: name(provider), message: login.message.replace(/^login failed: /, '') })}
                        </div>
                      ) : null}
                    </>
                  )}
                  <div className="np-wz-or" aria-hidden="true"><span>{t('providers.login.or')}</span></div>
                </div>
              ) : provider.login?.status === 'unverified' ? (
                <p className="np-wz-login-exp">{t('providers.login.experimental', { name: name(provider) })}</p>
              ) : null}
              {isCustom ? (
                <>
                  <label htmlFor="np-wz-url" className="np-wz-label">{t('providers.baseUrl')}</label>
                  <input id="np-wz-url" ref={keyInput} className="np-wz-input np-wz-input--url" value={custom.baseUrl} autoComplete="off" spellCheck={false} onChange={(e) => setCustom({ ...custom, baseUrl: e.target.value })} />
                  <label htmlFor="np-wz-models" className="np-wz-label">{t('providers.customModels')}</label>
                  <input id="np-wz-models" className="np-wz-input np-wz-input--url" value={custom.models} autoComplete="off" spellCheck={false} placeholder={MODEL_EXAMPLES} onChange={(e) => setCustom({ ...custom, models: e.target.value })} />
                </>
              ) : null}
              <label htmlFor="np-wz-k2" className="np-wz-label">{isCustom ? t('providers.keyOptional') : t('providers.keyOf', { name: name(provider) })}</label>
              <input
                id="np-wz-k2"
                ref={isCustom ? undefined : keyInput}
                className="np-wz-input np-wz-input--key"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                placeholder={keySaved ? t('providers.keySaved') : isCustom ? t('providers.pasteHere') : provider.keyPrefixes.length ? `${[...provider.keyPrefixes].sort((a, b) => b.length - a.length)[0]}…` : t('providers.pasteHere')}
                onChange={(e) => {
                  setKey(e.target.value);
                  setKeySaved(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runTest();
                }}
              />
              <div className="np-wz-keyfeed" aria-live="polite">
                {hit && pfx ? (
                  <div className="np-wz-detline"><span className="np-wz-detcheck"><Check size={11} width={3} /></span>{t('providers.kb.start')} <code>{pfx}</code>{t('providers.kb.isKeyOf', { name: name(provider) })}</div>
                ) : null}
                {!isCustom && !hit && key.trim().length >= 4 ? <div className="np-wz-warn np-rise">{t('providers.unknownPrefixHere', { name: name(provider) })}</div> : null}
              </div>
              <div className="np-wz-privacy">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></svg>
                <div>{t('providers.keyStorage', { name: name(provider) })}</div>
              </div>
            </div>

            <aside className="np-wz-card np-wz-card--aside">
              <h2 className="np-wz-eyebrow np-wz-eyebrow--tight">{t('providers.noKeyTitle')}</h2>
              {provider.keyUrl ? (
                <button
                  type="button"
                  className="np-wz-getkey"
                  onClick={() => {
                    void navigate(provider.keyUrl!, { newTab: true });
                    setOpened(true);
                  }}
                >
                  {t('providers.getKey')}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></svg>
                </button>
              ) : null}
              <div className="np-wz-site">{isCustom ? t('providers.siteCustom') : meta.site}</div>
              {opened ? <div className="np-wz-opened np-rise" role="status">{t('providers.opened')}</div> : null}
              <ol className="np-wz-how">
                {how.map((h, i) => (
                  <li key={i} style={{ animationDelay: `${200 + i * 90}ms` }}><span className="np-wz-how-n">{i + 1}</span><span className="np-wz-how-t">{h}</span></li>
                ))}
              </ol>
              {TIPS.has(provider.id) ? <div className="np-wz-tip">{t(`providers.tip.${provider.id}`)}</div> : null}
            </aside>
          </div>
          <div className="np-wz-actions">
            <button type="button" className="np-wz-btn np-wz-btn--ghost" onClick={back}>{t('providers.back')}</button>
            <button type="button" className="np-wz-btn np-wz-btn--solid np-wz-btn--go" aria-disabled={!keyOk} onClick={runTest}>
              {t('providers.test')}<Arrow />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Paso 3: prueba y asignación.
  if (!provider) return null;
  const sm = summary()!;
  const ph = test.phase;
  const models = localModels(provider)?.length
    ? localModels(provider)!.map((m) => registry.model(provider.id, m)?.name ?? m)
    : provider.id === 'custom'
      ? custom.models.split(',').map((m) => m.trim()).filter(Boolean)
      : provider.models.map((m) => m.name);
  const checks = [
    { label: t('providers.chk.connect'), detail: t('providers.chk.connectOk', { ms: test.latencyMs }), models: null as string[] | null, reply: false },
    { label: t('providers.chk.models'), detail: t('providers.chk.modelsOk', { n: models.length }), models, reply: false },
    { label: t('providers.chk.reply'), detail: t('providers.chk.replyOk', { s: (test.latencyMs / 1000).toFixed(1).replace('.', ',') }), models: null, reply: true },
  ];
  const canDone = ph >= 4 && test.ok;
  const big = sm.heavy?.modelName ?? '';
  const plain = sm.allLocal ? t('providers.plain.local', { big }) : TASKS.some((s) => s.stage && sm.rows[s.stage]?.local) ? t('providers.plain.mixed', { big }) : t('providers.plain.cloud', { big });
  const limit = ai.monthlyLimitUsd;
  const endpoint = (provider.id === 'custom' ? custom.baseUrl : provider.baseUrl).replace(/^https?:\/\//, '');
  return (
    <div className="np-wz">
      {header}
      <div className={`np-wz-pane np-wz-pane--${dir}`} key="s3">
        <div className="np-wz-cols np-wz-cols--test">
          <div className="np-wz-card np-wz-card--checks">
            <div className="np-wz-checks-head">
              <ProviderLogo id={provider.id} size={44} radius={12} mark={22} mono={16} />
              <div>
                <div className="np-wz-checks-title" role="status">{test.failed ? t('providers.failTitle', { name: name(provider) }) : ph >= 3 ? t('providers.works', { name: name(provider) }) : t('providers.testingTitle', { name: name(provider) })}</div>
                <div className="np-wz-checks-ep">{endpoint}</div>
              </div>
            </div>
            {checks.map((c, i) => {
              const done = !test.failed && ph > i;
              const run = !test.failed && ph === i;
              const bad = test.failed && i === 0;
              return (
                <div className="np-wz-check" key={c.label}>
                  <span className="np-wz-check-ico" data-state={bad ? 'bad' : done ? 'done' : run ? 'run' : 'wait'}>
                    {bad ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    ) : done ? (
                      <Check size={12} width={3} />
                    ) : run ? (
                      <span className="np-wz-spin" />
                    ) : (
                      <span className="np-wz-check-n">{i + 1}</span>
                    )}
                  </span>
                  <div className="np-wz-check-body">
                    <div className="np-wz-check-title" data-on={done || run || bad}>{c.label}</div>
                    {done ? <div className="np-wz-check-detail np-rise">{c.detail}</div> : null}
                    {bad ? <div className="np-wz-check-detail np-wz-check-detail--bad np-rise" role="alert">{t('providers.testFail', { message: test.error ?? '' })}</div> : null}
                    {done && c.models ? (
                      <div className="np-wz-models">
                        {c.models.map((m, mi) => <span key={m} className="np-wz-model" style={{ animationDelay: `${mi * 90}ms` }}>{m}</span>)}
                      </div>
                    ) : null}
                    {done && c.reply ? <div className="np-wz-reply">{t('providers.chk.replyText')}</div> : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="np-wz-right">
            {test.failed ? (
              <div className="np-wz-card np-wz-failed np-rise">
                <div className="np-wz-eyebrow np-wz-eyebrow--bad">{t('providers.failEyebrow')}</div>
                <p className="np-wz-failed-text">{isLocalP(provider) ? t('providers.failLocal', { name: name(provider) }) : provider.id === 'custom' ? t('providers.failCustom') : t('providers.failCloud', { name: name(provider) })}</p>
                <button type="button" className="np-wz-btn np-wz-btn--solid" onClick={() => void startTest(provider)}>{t('providers.retry')}</button>
              </div>
            ) : ph < 4 ? (
              <div className="np-wz-card np-wz-skel" aria-busy="true">
                <div className="np-wz-eyebrow np-wz-eyebrow--faint">{t('providers.assigning')}</div>
                <div className="np-wz-sk" style={{ height: 18, width: '70%' }} />
                {[0, 1, 2, 3].map((i) => <div key={i} className="np-wz-sk" style={{ height: 44 }} />)}
              </div>
            ) : (
              <div className="np-wz-card np-wz-assigned np-rise">
                <div className="np-wz-assigned-head">
                  <span className="np-wz-assigned-check"><Check size={12} width={3} /></span>
                  <span className="np-wz-eyebrow np-wz-eyebrow--ok">{t('providers.assignedAuto')}</span>
                </div>
                <div className="np-wz-plain">{plain}</div>
                <ul className="np-wz-tasks np-stagger">
                  {TASKS.map((s, i) => {
                    const r = s.stage ? sm.rows[s.stage] : undefined;
                    const c = s.stage ? sm.costs[s.stage] : 0;
                    const inHome = !s.stage || !!r?.local || c === 0;
                    return (
                      <li key={s.id} className="np-wz-task">
                        <span className="np-wz-task-n">{String(i + 1).padStart(2, '0')}</span>
                        <span className="np-wz-task-main">
                          <span className="np-wz-task-name">{t(`providers.task.${s.id}`)}</span>
                          <span className="np-wz-task-model">{!s.stage ? t('providers.task.noAi') : r ? `${r.modelName} · ${r.providerName}` : '—'}</span>
                        </span>
                        <span className="np-wz-where" data-home={inHome}>{inHome ? t('providers.where.home') : t('providers.where.cloud')}</span>
                        <span className="np-wz-task-cost">{s.id === 'agent' && c ? t('providers.perQuestion', { cost: money(c, fmt, free, { approx: true }) }) : !s.stage ? free : money(c, fmt, free, { approx: true })}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="np-wz-total">
                  <div>
                    <div className="np-wz-total-label">{t('providers.estimateLabel')}</div>
                    <div className="np-wz-total-value">{money(sm.total, fmt, free, { approx: true })}</div>
                  </div>
                  <div className="np-wz-total-side">
                    {t('providers.agentApart', { cost: money(sm.costs.agent ?? 0, fmt, free, { approx: true }) })}
                    <br />
                    {limit ? t('providers.limitLine', { limit: fmt(limit) }) : t('providers.noLimitLine')}
                  </div>
                </div>
                <button type="button" className="np-wz-adv" aria-expanded={adv} onClick={() => setAdv(!adv)}>
                  <svg className="np-wz-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                  {t('providers.advanced')}
                </button>
                {adv ? (
                  <div className="np-wz-adv-body np-rise">
                    {t('providers.advancedBody')}{' '}
                    <a
                      href="newpaper://ajustes/ia"
                      onClick={(e) => {
                        e.preventDefault();
                        onDone();
                      }}
                    >
                      {t('providers.advancedLink')}
                    </a>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>
        <div className="np-wz-actions">
          <button type="button" className="np-wz-btn np-wz-btn--ghost" onClick={back}>{t('providers.back')}</button>
          <button type="button" className="np-wz-btn np-wz-btn--solid np-wz-btn--done" aria-disabled={!canDone} onClick={() => (canDone ? void finish() : undefined)}>{t('providers.done')}</button>
        </div>
      </div>
    </div>
  );
}
