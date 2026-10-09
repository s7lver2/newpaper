import { useI18n } from '@newpaper/i18n/react';
import { autoAssign, PRESETS, type Assignments, type PresetId, type Registry } from '@newpaper/pipeline';
import { useEffect, useRef, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { LocalProbe, MonthUsage } from '../../ipc/types';
import { parseInternalUrl } from '../../shell/internalUrl';
import { openInternal } from '../../shell/navigate';
import { useActiveTab } from '../../state/browser';
import { getRegistry, useAiSettings } from '../ai/pipeline';
import { AiPipeline, pipelineTotals } from './AiPipeline';
import { AiProviders } from './AiProviders';
import { money, useUsd } from './aiModel';
import { ConnectWizard } from './ConnectWizard';

export function AiSection() {
  const { t } = useI18n();
  const fmt = useUsd();
  const ai = useAiSettings();
  const tab = useActiveTab();
  const connecting = parseInternalUrl(tab?.url ?? '')?.path[1] === 'conectar';
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [usage, setUsage] = useState<MonthUsage | null>(null);
  const [probe, setProbe] = useState<LocalProbe>({ ollama: null, lmstudio: null });

  useEffect(() => {
    void getRegistry().then(setRegistry);
    void commands.usageMonth().then(setUsage).catch(() => {});
    void commands.aiLocalProbe().then(setProbe).catch(() => {});
  }, []);

  if (connecting) return <ConnectWizard onDone={() => void openInternal('ajustes', ['ia'])} />;
  if (!registry) return null;

  const localMap = Object.fromEntries(Object.entries(probe).filter(([, v]) => v?.length)) as Record<string, string[]>;
  const available = [...new Set([...ai.connected, ...Object.keys(localMap)])];
  const manual = Object.keys(ai.assignments).length > 0;
  const effective: Assignments = manual ? ai.assignments : autoAssign(registry, available, ai.preset, localMap);
  const free = t('providers.free');

  return (
    <section className="np-aip np-stagger" aria-labelledby="np-set-ai">
      <div>
        <h2 id="np-set-ai" className="np-settings-h2">{t('settings.ai.title')}</h2>
        <p className="np-settings-hint">{t('settings.ai.lead')}</p>
      </div>

      <div>
        <div className="np-aip-eyebrow np-aip-caps np-aip-eyebrow--block">{t('settings.ai.startPoint')}</div>
        <div className="np-aip-presets" role="radiogroup" aria-label={t('settings.ai.startPoint')}>
          {PRESETS.map((p) => {
            const on = ai.preset === p.id && !manual && available.length > 0;
            const a = autoAssign(registry, available, p.id, localMap);
            const tot = pipelineTotals(registry, a, ai.detector);
            const meta = available.length === 0 ? '—' : t('settings.ai.perNews', { cost: `${money(tot.usd, fmt, free)}${tot.unknown ? '+' : ''}` });
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                className="np-aip-preset np-lift"
                onClick={() => {
                  void ai.setPreset(p.id as PresetId).then(() => ai.setAssignments({}));
                }}
              >
                <span className="np-aip-preset-name">{t(`providers.preset.${p.id}`)}</span>
                <span className="np-aip-preset-desc">{t(`providers.presetDesc.${p.id}`)}</span>
                <span className="np-aip-preset-meta">{meta}</span>
              </button>
            );
          })}
        </div>
      </div>

      <AiProviders registry={registry} ai={ai} localMap={localMap} />

      {available.length === 0 ? (
        <div className="np-aip-empty">
          <div className="np-aip-empty-title">{t('settings.ai.emptyTitle')}</div>
          <p className="np-aip-empty-text">{t('settings.ai.emptyText')}</p>
          <button type="button" className="np-aip-empty-btn" onClick={() => void openInternal('ajustes', ['ia', 'conectar'])}>{t('providers.connectOne')}</button>
        </div>
      ) : (
        <AiPipeline registry={registry} ai={ai} localMap={localMap} effective={effective} />
      )}

      <Budget limit={ai.monthlyLimitUsd} onChange={(v) => void ai.setMonthlyLimitUsd(v)} spent={usage ? fmt(usage.cost) : null} />
    </section>
  );
}

/** Límite de gasto mensual: 0 = sin límite. Se guarda tras una pausa para no escribir el ajuste en cada paso del deslizador. */
function Budget({ limit, onChange, spent }: { limit: number | null; onChange(v: number | null): void; spent: string | null }) {
  const { t } = useI18n();
  const fmt = useUsd(true);
  const [value, setValue] = useState(limit ?? 0);
  const [bump, setBump] = useState(0);
  const editing = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!editing.current) setValue(limit ?? 0);
  }, [limit]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const change = (v: number) => {
    editing.current = true;
    setValue(v);
    setBump((b) => b + 1);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      editing.current = false;
      onChange(v === 0 ? null : v);
    }, 350);
  };
  return (
    <div className="np-aip-budget">
      <div className="np-aip-budget-head">
        <label htmlFor="np-aip-budget">{t('settings.ai.budgetLabel')}</label>
        <span className="np-aip-budget-value" key={bump} data-bump={bump % 2}>{value === 0 ? t('settings.ai.noLimit') : fmt(value)}</span>
      </div>
      <input
        id="np-aip-budget"
        className="np-aip-slider"
        type="range"
        min={0}
        max={Math.max(50, Math.ceil(limit ?? 0))}
        step={1}
        value={value}
        aria-valuetext={value === 0 ? t('settings.ai.noLimit') : fmt(value)}
        onChange={(e) => change(Number(e.target.value))}
      />
      <div className="np-aip-budget-note">{t('settings.ai.budgetNote')}{spent ? ` ${t('providers.spentShort', { amount: spent })}` : ''}</div>
    </div>
  );
}
