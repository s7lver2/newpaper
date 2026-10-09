import { useI18n } from '@newpaper/i18n/react';
import { costOf, type ProviderEntry, type Registry } from '@newpaper/pipeline';
import { useEffect, useRef, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { CustomEndpoint } from '../../ipc/types';
import { openInternal } from '../../shell/navigate';
import type { useAiSettings } from '../ai/pipeline';
import { money, SETTINGS_NAME, useUsd } from './aiModel';
import { DEFAULT_CUSTOM, disconnectProvider, errorText, firstModel, markConnected, runConnectionTest, storeCredentials, type CustomDraft } from './connect';
import { SETTINGS_ORDER, TYPICAL_STEP } from './providerMeta';
import { ProviderLogo } from './ProviderLogo';

type Ai = ReturnType<typeof useAiSettings>;
const MODEL_EXAMPLES = 'llama3, mistral…';
type Filter = 'all' | 'on' | 'cloud' | 'local';
const FILTERS: Filter[] = ['all', 'on', 'cloud', 'local'];

export function providerName(p: ProviderEntry, customTitle: string): string {
  return p.id === 'custom' ? customTitle : (SETTINGS_NAME[p.id] ?? p.name);
}

/** Proveedores conectados (con clave) o, si son locales, detectados en marcha. */
export function isOn(p: ProviderEntry, connected: string[], localMap: Record<string, string[]>): boolean {
  return p.type === 'local' ? !!localMap[p.id]?.length : connected.includes(p.id);
}

interface Props { registry: Registry; ai: Ai; localMap: Record<string, string[]> }

export function AiProviders({ registry, ai, localMap }: Props) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const [selId, setSelId] = useState<string | null>(null);
  const list = SETTINGS_ORDER.map((id) => registry.get(id)).filter((p): p is ProviderEntry => !!p);
  const activeCount = list.filter((p) => isOn(p, ai.connected, localMap)).length;
  const shown = list.filter((p) => (filter === 'all' ? true : filter === 'on' ? isOn(p, ai.connected, localMap) : p.type === filter));
  const sel = selId ? registry.get(selId) : undefined;
  const custom = t('providers.customTitle');
  return (
    <div>
      <div className="np-aip-headrow">
        <span className="np-aip-eyebrow"><span className="np-aip-caps">{t('settings.ai.providers')}</span> · {t('settings.ai.providersCount', { total: list.length, active: activeCount })}</span>
        <div className="np-aip-filters" role="group" aria-label={t('settings.ai.filterLabel')}>
          {FILTERS.map((f) => (
            <button key={f} type="button" className="np-aip-filter" aria-pressed={filter === f} onClick={() => setFilter(f)}>{t(`settings.ai.filter.${f}`)}</button>
          ))}
          <button type="button" className="np-aip-wizard" onClick={() => void openInternal('ajustes', ['ia', 'conectar'])}>{t('providers.connectOne')}</button>
        </div>
      </div>
      <div className="np-aip-provgrid">
        {shown.map((p, i) => {
          const on = isOn(p, ai.connected, localMap);
          const selected = selId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className="np-aip-prov np-lift"
              aria-pressed={selected}
              data-on={on}
              style={{ animationDelay: `${i * 35}ms` }}
              onClick={() => setSelId(selected ? null : p.id)}
            >
              <ProviderLogo id={p.id} size={42} radius={12} mark={22} mono={14} className="np-aip-prov-logo" />
              <span className="np-aip-prov-name">{providerName(p, custom)}</span>
              <span className="np-aip-prov-sub">{t(`providers.subCfg.${p.id}`)}</span>
              <span className="np-aip-badge" data-on={on}>{on ? (p.type === 'local' ? t('settings.ai.detected') : t('settings.ai.connected')) : p.type === 'local' ? t('settings.ai.notDetected') : t('settings.ai.addKey')}</span>
            </button>
          );
        })}
      </div>
      {sel ? <ProviderPanel key={sel.id} p={sel} registry={registry} ai={ai} localModels={localMap[sel.id] ?? null} onClose={() => setSelId(null)} /> : null}
    </div>
  );
}

function ProviderPanel({ p, registry, ai, localModels, onClose }: { p: ProviderEntry; registry: Registry; ai: Ai; localModels: string[] | null; onClose(): void }) {
  const { t } = useI18n();
  const fmt = useUsd();
  const isCustom = p.id === 'custom';
  const isLocal = p.type === 'local';
  const on = isLocal ? !!localModels?.length : ai.connected.includes(p.id);
  const [draft, setDraft] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [custom, setCustom] = useState<CustomDraft>(DEFAULT_CUSTOM);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const keyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void commands.secretHas(`ai.${p.id}`).then((v) => alive && setHasKey(v)).catch(() => {});
    if (isCustom) {
      void commands.settingsGet<CustomEndpoint[]>('ai.customEndpoints').then((eps) => {
        const url = eps?.find((e) => e.id === 'custom')?.baseUrl;
        const model = Object.values(ai.assignments).find((a) => a?.provider === 'custom')?.model;
        if (alive && (url || model)) setCustom((c) => ({ baseUrl: url ?? c.baseUrl, models: model ?? c.models }));
      }).catch(() => {});
    }
    return () => {
      alive = false;
    };
    // Se lee una vez al abrir el panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id]);

  const typicalCost = (m: { price: { input: number; output: number } | null; id: string }) => costOf(registry.model(p.id, m.id), TYPICAL_STEP.input, TYPICAL_STEP.output);
  const models = localModels?.length
    ? localModels.map((id) => ({ id, name: registry.model(p.id, id)?.name ?? id, cost: 0 as number | null }))
    : isCustom
      ? custom.models.split(',').map((m) => m.trim()).filter(Boolean).map((id) => ({ id, name: id, cost: null as number | null }))
      : p.models.map((m) => ({ id: m.id, name: m.name, cost: typicalCost(m) }));

  const run = async () => {
    if (busy) return;
    if (!isLocal && !isCustom && !draft.trim() && !hasKey) {
      setResult({ ok: false, text: t('settings.ai.needKey') });
      keyRef.current?.focus();
      return;
    }
    setBusy(true);
    setResult(null);
    const fresh = !!draft.trim() && !on;
    try {
      if (!isLocal) await storeCredentials(p, draft, custom, hasKey);
      if (draft.trim()) {
        setDraft('');
        setHasKey(true);
      }
      const r = await runConnectionTest(p, firstModel(p, custom, localModels));
      if (r.ok) {
        if (!isLocal && !on) await markConnected(ai, p, custom);
        setResult({ ok: true, text: t('settings.ai.testOk', { ms: r.latencyMs }) });
      } else {
        // Una clave que no funciona no se deja guardada si el proveedor no estaba conectado.
        if (fresh) {
          await commands.secretDelete(`ai.${p.id}`).catch(() => {});
          setHasKey(false);
        }
        setResult({ ok: false, text: t('providers.testFail', { message: r.error ?? '' }) });
      }
    } catch (e) {
      setResult({ ok: false, text: t('providers.testFail', { message: errorText(e) }) });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    if (isLocal) return;
    if (on) {
      await disconnectProvider(ai, p.id);
      setHasKey(false);
      setResult(null);
    } else {
      keyRef.current?.focus();
      if (draft.trim() || isCustom) void run();
      else setResult({ ok: false, text: t('settings.ai.needKey') });
    }
  };

  const name = providerName(p, t('providers.customTitle'));
  const endpoint = isCustom ? custom.baseUrl : p.baseUrl.replace(/^https?:\/\//, '');
  return (
    <div className="np-aip-panel" role="region" aria-label={name}>
      <div className="np-aip-panel-head">
        <ProviderLogo id={p.id} size={46} radius={13} mark={26} mono={16} className="np-aip-panel-logo" />
        <div className="np-aip-panel-title">
          <div className="np-aip-panel-name">{name}</div>
          <div className="np-aip-panel-kind">{isLocal ? t('settings.ai.kindLocal') : t('providers.kind.cloud')}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-disabled={isLocal}
          aria-label={t('settings.ai.activate', { name })}
          title={isLocal ? t('settings.ai.localAuto') : undefined}
          className="np-switch"
          onClick={() => void toggle()}
        >
          <span className="np-switch-thumb" aria-hidden="true" />
        </button>
        <button type="button" className="np-aip-close" aria-label={t('settings.ai.close')} onClick={onClose}>×</button>
      </div>
      <div className="np-aip-fields">
        {!isLocal ? (
          <div>
            <label htmlFor="np-aip-pkey" className="np-aip-flabel">{t('settings.ai.apiKey')}</label>
            <input
              id="np-aip-pkey"
              ref={keyRef}
              className="np-aip-input"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              placeholder={hasKey ? t('providers.keySaved') : t('providers.pasteHere')}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void run();
              }}
            />
          </div>
        ) : null}
        <div>
          <label htmlFor="np-aip-pend" className="np-aip-flabel">{t('settings.ai.address')}</label>
          <input
            id="np-aip-pend"
            className="np-aip-input np-aip-input--ro"
            value={isLocal ? p.baseUrl.replace(/^https?:\/\//, '') : endpoint}
            readOnly={!isCustom}
            onChange={(e) => setCustom({ ...custom, baseUrl: e.target.value })}
            spellCheck={false}
          />
        </div>
        {isCustom ? (
          <div>
            <label htmlFor="np-aip-pmodels" className="np-aip-flabel">{t('providers.customModels')}</label>
            <input id="np-aip-pmodels" className="np-aip-input" value={custom.models} placeholder={MODEL_EXAMPLES} spellCheck={false} onChange={(e) => setCustom({ ...custom, models: e.target.value })} />
          </div>
        ) : null}
      </div>
      <div className="np-aip-flabel np-aip-flabel--models">{t('settings.ai.models')}</div>
      <div className="np-aip-models">
        {models.length ? models.map((m) => (
          <span key={m.id} className="np-aip-model">{m.name}<span className="np-aip-model-cost">{m.cost === null ? '—' : m.cost === 0 ? t('providers.free') : money(m.cost, fmt, '', { approx: true })}</span></span>
        )) : <span className="np-aip-muted">{isLocal ? t('settings.ai.noLocalModels') : t('settings.ai.noModels')}</span>}
      </div>
      <div className="np-aip-testrow">
        <button type="button" className="np-aip-test" data-busy={busy} aria-disabled={busy} onClick={() => void run()}>{busy ? t('providers.testing') : t('providers.test')}</button>
        <span className="np-aip-result" role="status" aria-live="polite">
          {result?.ok ? (
            <span className="np-aip-ok"><span className="np-aip-ok-dot">✓</span>{result.text}</span>
          ) : result ? (
            <span className="np-aip-bad">{result.text}</span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
