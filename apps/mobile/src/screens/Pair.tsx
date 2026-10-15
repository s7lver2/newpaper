import { useI18n } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { Format, scan } from '@tauri-apps/plugin-barcode-scanner';
import { useState } from 'react';
import { resetPipeline } from '../ai/pipeline';
import { ipc, type OllamaProbe, type PeerView } from '../ipc';
import { go } from '../router';

/** Emparejar con el PC (QR o codigo) y, si su Ollama es visible en la red, ofrecer usarlo para el analisis rapido. */
export function Pair() {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [peer, setPeer] = useState<PeerView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ollama, setOllama] = useState<OllamaProbe | null>(null);
  const [state, setState] = useState<'idle' | 'pairing' | 'probing' | 'done'>('idle');

  const pairWith = async (c: string) => {
    setState('pairing');
    setError(null);
    setOllama(null);
    try {
      const p = await ipc.syncPairWith(c.trim());
      setPeer(p);
      setState('probing');
      for (const addr of p.addresses) {
        const host = addr.split(':')[0];
        try {
          setOllama(await ipc.ollamaProbe(`http://${host}:11434`));
          break;
        } catch {
          /* este PC no comparte su Ollama en esta direccion */
        }
      }
      setState('done');
    } catch (e) {
      setError(String((e as { message?: string }).message ?? e));
      setState('idle');
    }
  };

  const scanQr = async () => {
    try {
      const r = await scan({ windowed: false, formats: [Format.QRCode] });
      if (r.content.startsWith('np1:')) await pairWith(r.content);
      else setError(t('mobile.pair.notNewpaper'));
    } catch (e) {
      setError(String((e as { message?: string }).message ?? e));
    }
  };

  return (
    <section>
      <h1 className="m-title">{t('sync.pair.title')}</h1>
      <p>{t('mobile.pair.body')}</p>
      <Button variant="primary" disabled={state === 'pairing'} onClick={() => void scanQr()}>{t('mobile.pair.scan')}</Button>
      <label className="np-field">
        <span>{t('sync.pair.haveCode')}</span>
        <input className="m-input" value={code} spellCheck={false} onChange={(e) => setCode(e.target.value)} />
      </label>
      <Button disabled={!code.startsWith('np1:') || state === 'pairing'} onClick={() => void pairWith(code)}>{t('sync.pair.useCode')}</Button>
      {state === 'pairing' ? <p aria-busy="true">{t('mobile.pair.pairing')}</p> : null}
      {error ? <p role="alert">{t('mobile.pair.failed', { message: error })}</p> : null}
      {peer ? <p role="status">{t('mobile.pair.paired', { name: peer.name, fp: peer.fingerprint })}</p> : null}
      {state === 'done' && peer ? (
        ollama ? (
          <div className="m-card">
            <strong>{t('mobile.pair.ollamaTitle', { name: peer.name })}</strong>
            <p className="np-muted">{t('mobile.pair.ollamaBody', { n: ollama.models.length })}</p>
            <Button
              variant="primary"
              onClick={() =>
                void ipc.usePcOllama(ollama.base).then(() => {
                  resetPipeline();
                  go('ajustes');
                })
              }
            >
              {t('mobile.pair.ollamaUse')}
            </Button>
          </div>
        ) : (
          <p className="np-hint">{t('mobile.pair.ollamaHint')}</p>
        )
      ) : null}
    </section>
  );
}
