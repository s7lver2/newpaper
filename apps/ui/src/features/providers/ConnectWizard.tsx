import { useI18n } from '@newpaper/i18n/react';
import { autoAssign, describeAssignment, detectProviders, estimateAnalysis, type ProviderEntry, type Registry } from '@newpaper/pipeline';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useMemo, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { LocalProbe } from '../../ipc/types';
import { navigate } from '../../shell/navigate';
import { getPipeline, getRegistry, resetPipeline, useAiSettings } from '../ai/pipeline';

type Step = 1 | 2 | 3;
const SAMPLE = 'x'.repeat(6000);

export function ConnectWizard({ onDone }: { onDone(): void }) {
  const { t, formatCurrency, formatNumber } = useI18n();
  const ai = useAiSettings();
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [local, setLocal] = useState<LocalProbe>({ ollama: null, lmstudio: null });
  const [step, setStep] = useState<Step>(1);
  const [provider, setProvider] = useState<ProviderEntry | null>(null);
  const [key, setKey] = useState('');
  // El endpoint propio solo tiene dirección y modelos (CustomEndpoint de Rust): sin nombre visible.
  const [custom, setCustom] = useState({ baseUrl: 'http://127.0.0.1:8000/v1', models: '' });
  const [test, setTest] = useState<{ busy: boolean; ok: boolean | null; latencyMs: number; error: string | null }>({ busy: false, ok: null, latencyMs: 0, error: null });

  useEffect(() => {
    void getRegistry().then(setRegistry);
    void commands.aiLocalProbe().then(setLocal).catch(() => {});
  }, []);
  const detected = useMemo(() => (registry && key.length >= 4 ? detectProviders(key.trim(), registry) : []), [registry, key]);

  if (!registry) return <p className="np-panel-empty" aria-busy="true">{t('providers.loading')}</p>;
  const choose = (p: ProviderEntry) => {
    setProvider(p);
    setTest({ busy: false, ok: null, latencyMs: 0, error: null });
    setStep(2);
  };
  const localModels = (p: ProviderEntry) => (p.id === 'ollama' ? local.ollama : p.id === 'lmstudio' ? local.lmstudio : null);
  const needsKey = (p: ProviderEntry) => p.type === 'cloud';
  const firstModel = (p: ProviderEntry) =>
    p.id === 'custom' ? custom.models.split(',')[0]?.trim() ?? '' : (localModels(p)?.[0] ?? p.models.find((m) => m.tier === 'light')?.id ?? p.models[0]?.id ?? '');

  const runTest = async () => {
    if (!provider) return;
    setTest({ busy: true, ok: null, latencyMs: 0, error: null });
    try {
      // La clave del endpoint propio va a `ai.custom` (el id fijo del endpoint).
      if ((needsKey(provider) || provider.id === 'custom') && key.trim()) await commands.secretSet(`ai.${provider.id}`, key.trim());
      if (provider.id === 'custom') {
        const local = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/.test(custom.baseUrl);
        await commands.aiSetEndpoints([{ id: 'custom', baseUrl: custom.baseUrl, auth: key.trim() ? 'bearer' : 'none', local }]);
      }
      resetPipeline();
      const r = await (await getPipeline()).testConnection({ provider: provider.id, model: firstModel(provider) });
      setTest({ busy: false, ok: r.ok, latencyMs: r.latencyMs, error: r.ok ? null : r.error });
    } catch (e) {
      setTest({ busy: false, ok: false, latencyMs: 0, error: e instanceof Error ? e.message : String(e) });
    }
  };

  const finish = async () => {
    if (!provider) return;
    const connected = [...new Set([...ai.connected, provider.id])];
    await ai.setConnected(connected);
    if (provider.id === 'custom' && connected.length === 1) {
      // Un endpoint propio no está en el registro: se asigna a todas las etapas a mano.
      const ref = { provider: 'custom', model: firstModel(provider) };
      await ai.setAssignments({ claims: ref, quickScore: ref, verify: ref, score: ref, synthesis: ref, aiDetect: ref, agent: ref, investigate: ref });
    }
    setStep(3);
  };

  if (step === 1) {
    const byCat = (c: ProviderEntry['category']) => registry.providers.filter((p) => p.category === c);
    return (
      <div className="np-wizard">
        <h2>{t('providers.title')}</h2>
        <p className="np-muted">{t('providers.subtitle')}</p>
        <h3>{t('providers.cat.recommended')}</h3>
        <div className="np-wizard-cards">
          {byCat('recommended').map((p) => (
            <button key={p.id} type="button" className="np-wizard-card np-wizard-card--big" onClick={() => choose(p)}>
              <strong>{p.name}</strong>
              <span>{t(`providers.pitch.${p.id}`)}</span>
              <span className="np-link">{t('providers.connect', { name: p.name })}</span>
            </button>
          ))}
        </div>
        <label className="np-wizard-key">
          <span>{t('providers.pasteKey')}</span>
          <input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} />
          <span className="np-muted">{t('providers.pasteHint')}</span>
        </label>
        {detected.length === 1 ? (
          <p className="np-wizard-detected">
            {t('providers.detected', { name: detected[0]!.name })} <Button variant="primary" onClick={() => choose(detected[0]!)}>{t('providers.continue')}</Button>
          </p>
        ) : null}
        {detected.length > 1 ? (
          <div className="np-wizard-detected">
            <p>{t('providers.ambiguous')}</p>
            {detected.map((p) => (
              <Button key={p.id} onClick={() => choose(p)}>{p.name}</Button>
            ))}
          </div>
        ) : null}
        {key.length >= 4 && detected.length === 0 ? <p className="np-muted">{t('providers.unknownPrefix')}</p> : null}
        <h3>{t('providers.cat.cloud')}</h3>
        <p className="np-muted">{t('providers.cat.cloudHint')}</p>
        <div className="np-wizard-cards">
          {byCat('cloud').map((p) => (
            <button key={p.id} type="button" className="np-wizard-card" onClick={() => choose(p)}>
              <strong>{p.name}</strong>
            </button>
          ))}
        </div>
        <h3>{t('providers.cat.local')}</h3>
        <p className="np-muted">{t('providers.cat.localHint')}</p>
        <div className="np-wizard-cards">
          {byCat('local').map((p) => (
            <button key={p.id} type="button" className="np-wizard-card" onClick={() => choose(p)}>
              <strong>{p.name}</strong>
              <span className={localModels(p) ? 'np-tag np-tag--ok' : 'np-tag np-tag--muted'}>{localModels(p) ? t('providers.detectedLocal', { n: localModels(p)!.length }) : t('providers.notRunning')}</span>
            </button>
          ))}
        </div>
        <h3>{t('providers.cat.advanced')}</h3>
        {byCat('advanced').map((p) => (
          <button key={p.id} type="button" className="np-wizard-card" onClick={() => choose(p)}>
            <strong>{t('providers.customTitle')}</strong>
            <span>{t('providers.customHint')}</span>
          </button>
        ))}
      </div>
    );
  }

  if (step === 2 && provider) {
    return (
      <div className="np-wizard">
        <h2>{provider.id === 'custom' ? t('providers.customTitle') : provider.name}</h2>
        {provider.id === 'custom' ? (
          <>
            <label className="np-field"><span>{t('providers.baseUrl')}</span><input value={custom.baseUrl} onChange={(e) => setCustom({ ...custom, baseUrl: e.target.value })} /></label>
            <label className="np-field"><span>{t('providers.customModels')}</span><input value={custom.models} onChange={(e) => setCustom({ ...custom, models: e.target.value })} /></label>
          </>
        ) : (
          <p className="np-mono np-muted">{provider.baseUrl}</p>
        )}
        {needsKey(provider) || provider.id === 'custom' ? (
          <label className="np-field">
            <span>{t('providers.key')}</span>
            <input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} />
            {provider.keyPrefixes.length ? <span className="np-muted">{t('providers.startsWith', { prefix: provider.keyPrefixes.at(-1)! })}</span> : null}
          </label>
        ) : null}
        <p className="np-hint">{t('providers.keyStorage', { name: provider.name })}</p>
        {provider.keyUrl ? (
          <p>
            {t('providers.noKey')} <Button variant="quiet" onClick={() => void navigate(provider.keyUrl!, { newTab: true })}>{t('providers.getKey')}</Button>
          </p>
        ) : null}
        <div className="np-wizard-actions">
          <Button onClick={() => setStep(1)}>{t('providers.back')}</Button>
          <Button disabled={test.busy || (needsKey(provider) && !key.trim())} onClick={() => void runTest()}>
            {test.busy ? t('providers.testing') : t('providers.test')}
          </Button>
          <Button variant="primary" disabled={!test.ok} onClick={() => void finish()}>{t('providers.continue')}</Button>
        </div>
        {test.ok === true ? <p className="np-tag np-tag--ok" role="status">{t('providers.testOk', { ms: formatNumber(test.latencyMs) })}</p> : null}
        {test.ok === false ? <p className="np-agent-error" role="alert">{t('providers.testFail', { message: test.error ?? '' })}</p> : null}
      </div>
    );
  }

  const assignments = Object.keys(ai.assignments).length ? ai.assignments : autoAssign(registry, [...new Set([...ai.connected])], ai.preset, Object.fromEntries(Object.entries({ ollama: local.ollama, lmstudio: local.lmstudio }).filter(([, v]) => v?.length)) as Record<string, string[]>);
  const est = estimateAnalysis(registry, assignments, SAMPLE, 5);
  return (
    <div className="np-wizard">
      <h2>{t('providers.doneTitle', { name: provider?.name ?? '' })}</h2>
      <p className="np-muted">{t('providers.doneSub')}</p>
      <table className="np-table">
        <tbody>
          {describeAssignment(registry, assignments).map((r) => {
            const usd = est.perStage.find((x) => x.stage === r.stage)?.usd;
            return (
              <tr key={r.stage}>
                <td>{t(`analysis.stage.${r.stage}`)}</td>
                <td>{r.modelName}</td>
                <td>{r.local ? t('providers.where.local') : r.providerName}</td>
                <td className="np-num">{usd === null || usd === undefined ? t('providers.priceUnknown') : formatCurrency(usd, 'USD')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>{t('providers.estimate', { total: formatCurrency(est.totalUsd, 'USD') })}{est.unknown ? ` ${t('providers.estimateUnknown')}` : ''}</p>
      <div className="np-wizard-actions">
        <Button onClick={() => (setProvider(null), setKey(''), setStep(1))}>{t('providers.another')}</Button>
        <Button variant="primary" onClick={onDone}>{t('providers.done')}</Button>
      </div>
    </div>
  );
}
