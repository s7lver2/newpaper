import { useI18n } from '@newpaper/i18n/react';
import { autoAssign, PRESETS, type Assignments, type PresetId, type Registry } from '@newpaper/pipeline';
import { useEffect, useRef, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { LocalProbe, MonthUsage } from '../../ipc/types';
import { parseInternalUrl } from '../../shell/internalUrl';
import { openInternal } from '../../shell/navigate';
import { useActiveTab } from '../../state/browser';
import { getRegistry, useAiSettings } from '../ai/pipeline';
import { AiMine } from './AiMine';
import { AiPipeline, pipelineStats } from './AiPipeline';
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
  const [advanced, setAdvanced] = useState(false);
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

  const stats = pipelineStats(registry, ai, effective);
  const hasAny = available.length > 0;
  const budget = <Budget limit={ai.monthlyLimitUsd} onChange={(v) => void ai.setMonthlyLimitUsd(v)} spent={usage ? fmt(usage.cost) : null} />;

  return (
    <section className="np-aip np-stagger" aria-labelledby="np-set-ai">
      <div>
        <h2 id="np-set-ai" className="np-settings-h2">{t('settings.ai.title')}</h2>
        <p className="np-settings-hint">{t('settings.ai.lead')}</p>
      </div>

      {hasAny ? (
        <>
          <AiMine registry={registry} ai={ai} localMap={localMap} />

          <div className="np-aip-work">
            <div className="np-aip-eyebrow np-aip-caps np-aip-eyebrow--block">{t('settings.ai.startPoint')}</div>
            <Presets ai={ai} manual={manual} />
            <dl className="np-aip-stats">
              <div><dt>{t('settings.ai.sum.cost')}</dt><dd>{money(stats.total.usd, fmt, free)}{stats.total.unknown ? '+' : ''}</dd></div>
              <div><dt>{t('settings.ai.sum.time')}</dt><dd>~{Math.round(stats.seconds)} s</dd></div>
              <div><dt>{t('settings.ai.sum.local')}</dt><dd>{stats.localSteps} {t('settings.ai.of')} {stats.active.length}</dd></div>
            </dl>
          </div>

          {budget}
        </>
      ) : (
        <div className="np-aip-empty">
          <div className="np-aip-empty-title">{t('settings.ai.emptyTitle')}</div>
          <p className="np-aip-empty-text">{t('settings.ai.emptyText')}</p>
          <button type="button" className="np-aip-empty-btn" onClick={() => void openInternal('ajustes', ['ia', 'conectar'])}>{t('providers.connectOne')}</button>
        </div>
      )}

      <div className="np-aip-advanced">
        <button type="button" className="np-aip-advbtn" aria-expanded={advanced} aria-controls="np-aip-adv" onClick={() => setAdvanced(!advanced)}>
          <svg className="np-aip-advchev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          <span className="np-aip-advname">{t('settings.ai.advanced')}</span>
          <span className="np-aip-advhint">{t('settings.ai.advancedHint')}</span>
        </button>
        {advanced ? (
          <div id="np-aip-adv" className="np-aip-advbody np-rise">
            <AiProviders registry={registry} ai={ai} localMap={localMap} />
            {hasAny ? <AiPipeline registry={registry} ai={ai} localMap={localMap} effective={effective} /> : budget}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Punto de partida: cuatro opciones en una sola fila (interruptor de radio) y una línea que explica la elegida. */
function Presets({ ai, manual }: { ai: ReturnType<typeof useAiSettings>; manual: boolean }) {
  const { t } = useI18n();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = manual ? -1 : PRESETS.findIndex((p) => p.id === ai.preset);
  const pick = (i: number) => {
    void ai.setPreset(PRESETS[i]!.id as PresetId).then(() => ai.setAssignments({}));
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + PRESETS.length) % PRESETS.length;
    pick(next);
    refs.current[next]?.focus();
  };
  return (
    <>
      <div className="np-aip-seg" role="radiogroup" aria-label={t('settings.ai.startPoint')}>
        {PRESETS.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={current === i}
            tabIndex={current === i || (current === -1 && i === 0) ? 0 : -1}
            className="np-aip-seg-btn"
            onClick={() => pick(i)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t(`providers.preset.${p.id}`)}
          </button>
        ))}
      </div>
      <p className="np-aip-seg-desc" aria-live="polite">{current >= 0 ? t(`providers.presetDesc.${PRESETS[current]!.id}`) : t('settings.ai.customAssign')}</p>
    </>
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
