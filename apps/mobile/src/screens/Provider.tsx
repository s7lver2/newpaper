import { useI18n } from '@newpaper/i18n/react';
import { detectProviders, loadRegistry, type ProviderEntry, type Registry } from '@newpaper/pipeline';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useMemo, useState } from 'react';
import { getPipeline, resetPipeline } from '../ai/pipeline';
import { ipc } from '../ipc';
import { go } from '../router';

/** Conectar un proveedor: se pega la clave, se detecta el proveedor por su prefijo, se guarda en el llavero y se prueba. */
export function Provider() {
  const { t } = useI18n();
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [key, setKey] = useState('');
  const [chosen, setChosen] = useState<ProviderEntry | null>(null);
  const [state, setState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const [error, setError] = useState('');
  useEffect(() => {
    void ipc.configRead('providers.json').then((txt) => setRegistry(loadRegistry(JSON.parse(txt))));
  }, []);
  const found = useMemo(() => (registry && key.length >= 4 ? detectProviders(key.trim(), registry) : []), [registry, key]);
  const provider = chosen ?? (found.length === 1 ? found[0]! : null);
  if (!registry) return null;

  const test = async () => {
    if (!provider) return;
    const model = provider.models.find((m) => m.tier === 'light')?.id ?? provider.models[0]?.id;
    if (!model) {
      setState('fail');
      setError(t('providers.unknownPrefix'));
      return;
    }
    setState('testing');
    await ipc.secretSet(`ai.${provider.id}`, key.trim());
    const connected = (await ipc.settingsGet<string[]>('ai.connected')) ?? [];
    await ipc.settingsSet('ai.connected', [...new Set([...connected, provider.id])]);
    resetPipeline();
    const r = await (await getPipeline()).testConnection({ provider: provider.id, model });
    setState(r.ok ? 'ok' : 'fail');
    if (!r.ok) setError(r.error);
  };

  return (
    <section>
      <h1 className="m-title">{t('providers.title')}</h1>
      <p className="np-muted">{t('mobile.provider.pasteHint')}</p>
      <label className="np-field">
        <span>{t('providers.pasteKey')}</span>
        <input
          className="m-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            setChosen(null);
            setState('idle');
          }}
        />
      </label>
      {found.length > 1 && !chosen ? (
        <div>
          <p>{t('providers.ambiguous')}</p>
          {found.map((p) => (
            <Button key={p.id} onClick={() => setChosen(p)}>{p.name}</Button>
          ))}
        </div>
      ) : null}
      {key.length >= 4 && found.length === 0 ? (
        <div>
          <p className="np-muted">{t('providers.unknownPrefix')}</p>
          {registry.providers.filter((p) => p.type === 'cloud').map((p) => (
            <Button key={p.id} variant="quiet" onClick={() => setChosen(p)}>{p.name}</Button>
          ))}
        </div>
      ) : null}
      {provider ? <p>{t('providers.detected', { name: provider.name })}</p> : null}
      <p className="np-hint">{t('providers.keyStorage', { name: provider?.name ?? '' })}</p>
      <div className="m-row">
        <Button variant="primary" disabled={!provider || state === 'testing'} onClick={() => void test()}>
          {state === 'testing' ? t('providers.testing') : t('providers.test')}
        </Button>
        {state === 'ok' ? <Button onClick={() => go('ajustes')}>{t('providers.done')}</Button> : null}
      </div>
      {state === 'ok' ? <p role="status">{t('providers.doneSub')}</p> : null}
      {state === 'fail' ? <p role="alert">{t('providers.testFail', { message: error })}</p> : null}
    </section>
  );
}
