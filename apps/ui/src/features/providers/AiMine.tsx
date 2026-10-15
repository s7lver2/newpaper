import { useI18n } from '@newpaper/i18n/react';
import type { Registry } from '@newpaper/pipeline';
import { useState } from 'react';
import { openInternal } from '../../shell/navigate';
import type { useAiSettings } from '../ai/pipeline';
import { isOn, ProviderPanel, providerName } from './AiProviders';
import { ProviderLogo } from './ProviderLogo';

type Ai = ReturnType<typeof useAiSettings>;

/** Los proveedores que ya funcionan (conectados con clave o detectados en tu equipo), y el botón para añadir otro. */
export function AiMine({ registry, ai, localMap }: { registry: Registry; ai: Ai; localMap: Record<string, string[]> }) {
  const { t } = useI18n();
  const [selId, setSelId] = useState<string | null>(null);
  const mine = registry.providers.filter((p) => isOn(p, ai.connected, localMap));
  const sel = selId ? registry.get(selId) : undefined;
  const custom = t('providers.customTitle');
  return (
    <div>
      <div className="np-aip-headrow">
        <span className="np-aip-eyebrow np-aip-caps">{t('settings.ai.yours')}</span>
        <button type="button" className="np-aip-add" onClick={() => void openInternal('ajustes', ['ia', 'conectar'])}>{t('settings.ai.add')}</button>
      </div>
      <ul className="np-aip-mine">
        {mine.map((p) => {
          const selected = selId === p.id;
          return (
            <li key={p.id}>
              <button type="button" className="np-aip-row" aria-pressed={selected} onClick={() => setSelId(selected ? null : p.id)}>
                <ProviderLogo id={p.id} size={36} radius={10} mark={20} mono={13} />
                <span className="np-aip-row-text">
                  <span className="np-aip-row-name">{providerName(p, custom)}</span>
                  <span className="np-aip-row-sub">{t(`providers.subCfg.${p.id}`)}</span>
                </span>
                <span className="np-aip-badge" data-on="true">{p.type === 'local' ? t('settings.ai.detected') : t('settings.ai.connected')}</span>
                <svg className="np-aip-row-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </li>
          );
        })}
      </ul>
      {sel ? <ProviderPanel key={sel.id} p={sel} registry={registry} ai={ai} localModels={localMap[sel.id] ?? null} onClose={() => setSelId(null)} /> : null}
    </div>
  );
}
