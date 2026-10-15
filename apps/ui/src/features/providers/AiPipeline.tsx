import { useI18n } from '@newpaper/i18n/react';
import { type Assignment, type Assignments, type ProviderEntry, type Registry } from '@newpaper/pipeline';
import { useState } from 'react';
import type { useAiSettings } from '../ai/pipeline';
import { providerName } from './AiProviders';
import { money, stepCosts, stepSeconds, STEPS, useUsd, type StepDef } from './aiModel';
import { metaOf } from './providerMeta';
import { ProviderLogo } from './ProviderLogo';

type Ai = ReturnType<typeof useAiSettings>;
interface Props { registry: Registry; ai: Ai; localMap: Record<string, string[]>; effective: Assignments }

/** Colores de las franjas del resumen (las de Ajustes.dc.html); la gratuita es un verde apagado. */
const BAR_COLORS = ['#2340B8', '#0B6B50', '#B26A00', '#9C3D8A', '#5E5B55', '#C2412F'];
const DEFAULT_TEMP = 0.2;

export function pipelineTotals(registry: Registry, a: Assignments, detectorOn: boolean) {
  const costs = stepCosts(registry, a);
  const steps = STEPS.filter((s) => s.stage && s.stage !== 'agent' && (s.id !== 'aiDetect' || detectorOn));
  let usd = 0;
  let unknown = false;
  for (const s of steps) {
    const c = costs[s.stage!];
    if (c === null) unknown = true;
    else usd += c ?? 0;
  }
  return { usd, unknown, costs, steps };
}

/** Lo que resume la asignación: coste y tiempo por noticia, pasos que se quedan en tu equipo y cuántas noticias caben en el límite. */
export function pipelineStats(registry: Registry, ai: Ai, effective: Assignments) {
  const total = pipelineTotals(registry, effective, ai.detector);
  const active = STEPS.filter((s) => !(s.optional && !ai.detector));
  const isLocal = (a?: Assignment) => !a || registry.get(a.provider)?.type === 'local';
  const localSteps = active.filter((s) => !s.stage || isLocal(effective[s.stage])).length;
  const seconds = 2.2 + total.steps.reduce((n, s) => n + stepSeconds(registry, effective, s), 0) * 0.6;
  return { total, active, localSteps, seconds };
}

export function AiPipeline({ registry, ai, localMap, effective }: Props) {
  const { t } = useI18n();
  const fmt = useUsd();
  const [stage, setStage] = useState<StepDef['id']>('verify');
  const [pk, setPk] = useState(0);
  const free = t('providers.free');
  const customTitle = t('providers.customTitle');
  const { costs } = pipelineTotals(registry, effective, ai.detector);
  const usable = [...new Set([...ai.connected, ...Object.keys(localMap)])].map((id) => registry.get(id)).filter((p): p is ProviderEntry => !!p);

  const modelName = (a: Assignment) => registry.model(a.provider, a.model)?.name ?? a.model;
  const isLocalA = (a?: Assignment) => !a || registry.get(a.provider)?.type === 'local';
  const stepOff = (s: StepDef) => s.optional && !ai.detector;
  const stepLocal = (s: StepDef) => !s.stage || isLocalA(effective[s.stage]);

  const { total, active, localSteps, seconds } = pipelineStats(registry, ai, effective);
  const limit = ai.monthlyLimitUsd;
  const perMonth = total.usd === 0 || !limit ? t('settings.ai.unlimited') : `≈ ${Math.floor(limit / total.usd).toLocaleString()} ${t('settings.ai.newsUnit')}`;

  const cur = STEPS.find((s) => s.id === stage) ?? STEPS[3]!;
  const curIndex = STEPS.indexOf(cur);
  const ca = cur.stage ? effective[cur.stage] : undefined;
  const curProvider = ca ? registry.get(ca.provider) : undefined;
  const curModel = ca ? registry.model(ca.provider, ca.model) : undefined;

  const commit = (s: StepDef, next: Assignment) => {
    if (!s.stage) return;
    void ai.setAssignments({ ...effective, [s.stage]: next });
  };
  const modelsOf = (p: ProviderEntry): { id: string; name: string }[] =>
    localMap[p.id]?.length
      ? localMap[p.id]!.map((id) => ({ id, name: registry.model(p.id, id)?.name ?? id }))
      : p.id === 'custom'
        ? (ca?.provider === 'custom' ? [{ id: ca.model, name: ca.model }] : [])
        : p.models.map((m) => ({ id: m.id, name: m.name }));
  const pickProvider = (s: StepDef, p: ProviderEntry) => {
    const list = modelsOf(p);
    const tier = s.id === 'claims' || s.id === 'aiDetect' ? 'light' : 'strong';
    const preferred = p.models.find((m) => m.tier === tier && list.some((x) => x.id === m.id)) ?? p.models.find((m) => list.some((x) => x.id === m.id));
    const model = list.find((x) => x.id === preferred?.id) ?? list[0];
    if (!model) return;
    const prev = s.stage ? effective[s.stage] : undefined;
    commit(s, { provider: p.id, model: model.id, temperature: prev?.temperature, ...(prev?.fallback && p.type !== 'local' ? { fallback: prev.fallback } : {}) });
  };

  const temp = Math.round((ca?.temperature ?? DEFAULT_TEMP) * 10);
  const tempLabel = temp <= 2 ? t('settings.ai.temp.precise') : temp <= 6 ? t('settings.ai.temp.balanced') : t('settings.ai.temp.creative');
  const est = ca ? `${isLocalA(ca) ? free : money(cur.stage ? costs[cur.stage] : 0, fmt, free)} · ~${Math.round(stepSeconds(registry, effective, cur))} s` : '';
  const fb = ca?.fallback;
  const fbName = fb ? `${providerName(registry.get(fb.provider) ?? ({ id: fb.provider, name: fb.provider } as ProviderEntry), customTitle)} · ${registry.model(fb.provider, fb.model)?.name ?? fb.model}` : null;

  // Franjas del resumen: lo que cuesta cada paso con modelo.
  const bars = total.steps.map((s, i) => ({ id: s.id, name: t(`settings.ai.step.${s.id}`), usd: total.costs[s.stage!] ?? 0, color: (total.costs[s.stage!] ?? 0) === 0 ? '#3F7F6B' : BAR_COLORS[i % BAR_COLORS.length]! }));

  return (
    <div>
      <div className="np-aip-headrow">
        <span className="np-aip-eyebrow np-aip-caps">{t('settings.ai.pipeline')}</span>
        <span className="np-aip-hint">{t('settings.ai.pipelineHint')}</span>
      </div>
      <div className="np-aip-pipe">
        <div className="np-aip-stages">
          {STEPS.map((s, i) => {
            const a = s.stage ? effective[s.stage] : undefined;
            const off = !!stepOff(s);
            const p = a ? registry.get(a.provider) : undefined;
            const local = stepLocal(s);
            const nextLocal = i < STEPS.length - 1 ? stepLocal(STEPS[i + 1]!) : true;
            const c = s.stage ? costs[s.stage] : 0;
            const meta = p && !off ? metaOf(p.id) : null;
            return (
              <div key={s.id} className="np-aip-stage-wrap">
                <button type="button" className="np-aip-stage" aria-pressed={s.id === stage} data-off={off} onClick={() => { setStage(s.id); setPk((n) => n + 1); }}>
                  <span className="np-aip-node" style={meta ? ({ '--tint': meta.tint } as React.CSSProperties) : undefined} data-logo={!!meta}>
                    {meta?.svg ? <span className="np-aip-node-mark" dangerouslySetInnerHTML={{ __html: meta.svg }} /> : <span>{meta?.mono ?? s.glyph ?? String(i + 1)}</span>}
                  </span>
                  <span className="np-aip-stage-text">
                    <span className="np-aip-stage-name">{t(`settings.ai.step.${s.id}`)}</span>
                    <span className="np-aip-stage-model">
                      {off ? t('settings.ai.off') : !s.stage ? t(`settings.ai.stepFixed.${s.id}`) : a && p ? `${providerName(p, customTitle)} · ${modelName(a)}` : t('settings.ai.unassigned')}
                    </span>
                  </span>
                  <span className="np-aip-chip" data-kind={off ? 'off' : local ? 'home' : 'cloud'}>{off ? t('settings.ai.where.off') : local ? t('providers.where.home') : t('providers.where.cloud')}</span>
                  <span className="np-aip-stage-cost">{off ? '—' : !s.stage ? free : s.id === 'agent' ? `${money(c, fmt, free)}${c ? '/p' : ''}` : money(c, fmt, free)}</span>
                </button>
                {i < STEPS.length - 1 ? (
                  <div className="np-aip-conn" data-off={off} aria-hidden="true">
                    {off ? null : <span className="np-aip-pkt" style={{ animationDelay: `${i * 0.2}s`, background: nextLocal ? 'var(--np-ok)' : 'var(--np-accent)' }} />}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="np-aip-inspector" key={`${stage}-${pk % 2}`}>
          <div className="np-aip-ins-n">{t('settings.ai.stepOf', { n: curIndex + 1, total: STEPS.length })}</div>
          <h3 className="np-aip-ins-name">{t(`settings.ai.step.${cur.id}`)}</h3>
          <div className="np-aip-ins-desc">{t(`settings.ai.stepDesc.${cur.id}`)}</div>
          {!cur.stage ? <div className="np-aip-ins-note">{t(`settings.ai.stepNote.${cur.id}`)}</div> : null}
          {cur.optional ? (
            <div className="np-aip-ins-opt">
              <span>{t('settings.ai.activateStep')}</span>
              <button type="button" role="switch" aria-checked={ai.detector} aria-label={t('settings.ai.activateStepAria')} className="np-switch" onClick={() => void ai.setDetector(!ai.detector)}>
                <span className="np-switch-thumb" aria-hidden="true" />
              </button>
            </div>
          ) : null}
          {cur.stage && !stepOff(cur) ? (
            <>
              <div className="np-aip-ins-label">{t('settings.ai.provider')}</div>
              <div className="np-aip-ins-provs">
                {usable.map((p) => (
                  <button key={p.id} type="button" className="np-aip-ins-prov" aria-pressed={ca?.provider === p.id} aria-label={providerName(p, customTitle)} title={providerName(p, customTitle)} onClick={() => pickProvider(cur, p)}>
                    <ProviderLogo id={p.id} size={42} radius={10} mark={20} mono={13} />
                  </button>
                ))}
              </div>
              <div className="np-aip-ins-label np-aip-ins-label--model">{t('settings.ai.model')}</div>
              <div className="np-aip-ins-models">
                {curProvider ? modelsOf(curProvider).map((m) => (
                  <button key={m.id} type="button" className="np-aip-ins-model" aria-pressed={ca?.model === m.id} onClick={() => commit(cur, { provider: curProvider.id, model: m.id, temperature: ca?.temperature, fallback: ca?.fallback })}>{m.name}</button>
                )) : null}
              </div>
              <div className="np-aip-ins-range">
                <label htmlFor="np-aip-temp">{t('settings.ai.creativity')}</label>
                <span className="np-aip-mono">{tempLabel}</span>
              </div>
              <input
                id="np-aip-temp"
                className="np-aip-slider"
                type="range"
                min={0}
                max={10}
                step={1}
                value={temp}
                disabled={curModel?.noTemperature}
                aria-describedby={curModel?.noTemperature ? 'np-aip-temp-note' : undefined}
                onChange={(e) => ca && commit(cur, { ...ca, temperature: Number(e.target.value) / 10 })}
              />
              {curModel?.noTemperature ? <div id="np-aip-temp-note" className="np-aip-ins-hint">{t('settings.ai.noTemperature')}</div> : null}
              <div className="np-aip-ins-foot">
                <span>{fbName ? <>{t('settings.ai.fallbackTo')} <b>{fbName}</b></> : t('settings.ai.noFallback')}</span>
                <span className="np-aip-mono">{est}</span>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="np-aip-summary">
        <div className="np-aip-sumgrid">
          <div><div className="np-aip-sumlabel">{t('settings.ai.sum.cost')}</div><div className="np-aip-sumvalue">{money(total.usd, fmt, free, { approx: false })}{total.unknown ? '+' : ''}</div></div>
          <div><div className="np-aip-sumlabel">{t('settings.ai.sum.time')}</div><div className="np-aip-sumvalue">~{Math.round(seconds)} s</div></div>
          <div><div className="np-aip-sumlabel">{t('settings.ai.sum.local')}</div><div className="np-aip-sumvalue">{localSteps} {t('settings.ai.of')} {active.length}</div></div>
          <div><div className="np-aip-sumlabel">{limit ? t('settings.ai.sum.withLimit', { limit: fmt(limit) }) : t('settings.ai.sum.noLimit')}</div><div className="np-aip-sumvalue">{perMonth}</div></div>
        </div>
        <div className="np-aip-bars" aria-hidden="true">
          {bars.map((b) => <span key={b.id} title={`${b.name} · ${money(b.usd, fmt, free)}`} style={{ flexGrow: Math.max(b.usd * 1000, 0.4), background: b.color }} />)}
        </div>
      </div>
    </div>
  );
}

