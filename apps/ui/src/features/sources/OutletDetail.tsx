import { useI18n } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import type { OutletLean, TopicState } from '../../ipc/types';
import { clamp, leanLabelKey } from './leanModel';

const pct = (w: number) => Math.round(w * 100);

/** Detalle de un medio (mockup Ajustes › Fuentes): posición con su banda, de dónde sale, encuadre por tema, fiabilidad y corrección. */
export function OutletDetail({ outlet: o, topics, windowDays, enabled, flip, onToggle, onOverride }: {
  outlet: OutletLean;
  topics: TopicState[];
  windowDays: number;
  enabled: boolean;
  /** Alterna al cambiar de medio para reiniciar la animación de entrada sin remontar el eje (la banda y el punto se deslizan). */
  flip: boolean;
  onToggle(next: boolean): void;
  onOverride(lean: number | null): void;
}) {
  const { t, formatNumber } = useI18n();
  const est = o.estimate;
  const ovr = o.overrideLean;
  const shown = ovr ?? o.effective ?? 50;
  const [draft, setDraft] = useState<number>(shown);
  useEffect(() => setDraft(shown), [shown, o.outletId]);
  const topicName = (id: string) => topics.find((x) => x.id === id)?.name ?? id;
  const w = est?.weights ?? [0, 0, 0];
  const evidence: { key: string; weight: number; label: string; note: string; value: string }[] = [
    {
      key: 'own', weight: w[0], label: t('sources.detail.ownLabel'),
      note: est?.own != null ? t('sources.detail.ownNote', { n: est.ownN, days: windowDays }) : t('sources.detail.ownNone', { days: windowDays }),
      value: est?.own != null ? `${Math.round(est.own)} / 100` : '—',
    },
    {
      key: 'aud', weight: w[1], label: t('sources.detail.audienceLabel'),
      note: t('sources.detail.audienceNote'),
      value: est?.audience != null ? `${Math.round(est.audience)} / 100` : '—',
    },
    {
      key: 'ext', weight: w[2], label: t('sources.detail.externalLabel'),
      note: t('sources.detail.externalNote'),
      value: est?.external != null ? t(leanLabelKey(est.external)) : '—',
    },
  ];
  const commit = (v: number) => onOverride(Math.round(v));
  return (
    <div className="np-src-detail" data-flip={flip}>
      <div className="np-src-detail-head">
        <div>
          <h3 className="np-src-detail-name">{o.name}</h3>
          <div className="np-src-detail-sub">
            {est ? (
              <>
                {t('sources.detail.estimated')} <span className="np-mono np-src-ink">{Math.round(est.value)} ± {Math.round(est.uncertainty)}</span> · {t(leanLabelKey(est.value))}
              </>
            ) : (
              t('sources.settings.noData')
            )}
          </div>
        </div>
        <div className="np-src-detail-toggle">
          <span id={`np-src-use-${o.outletId}`}>{t('sources.detail.use')}</span>
          <button type="button" role="switch" className="np-switch" aria-checked={enabled} aria-labelledby={`np-src-use-${o.outletId}`} onClick={() => onToggle(!enabled)}>
            <span className="np-switch-thumb" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="np-src-mini" aria-hidden="true">
        <div className="np-src-mini-line" />
        {est ? <div className="np-src-mini-band" style={{ left: `${est.value - est.uncertainty}%`, width: `${est.uncertainty * 2}%` }} /> : null}
        {est ? <span className="np-src-mini-dot" style={{ left: `${est.value}%` }} /> : null}
        {ovr !== null ? <span className="np-src-mini-ovr np-rise" style={{ left: `${ovr}%` }} /> : null}
      </div>
      <div className="np-src-mini-labels"><span>{t('sources.mini.left')}</span><span>{t('sources.mini.center')}</span><span>{t('sources.mini.right')}</span></div>

      <div className="np-src-evtitle">{t('sources.detail.how')}</div>
      {evidence.map((e) => (
        <div key={e.key} className="np-src-ev">
          <span className="np-src-ev-w">{formatNumber(pct(e.weight))} %</span>
          <div className="np-src-ev-text"><div className="np-src-ev-label">{e.label}</div><div className="np-src-ev-note">{e.note}</div></div>
          <span className="np-src-ev-v">{e.value}</span>
        </div>
      ))}

      <div className="np-src-cards">
        <div className="np-src-soft">
          <div className="np-src-soft-title">{t('sources.detail.byTopic')}</div>
          {o.byTopic.length ? (
            o.byTopic.map((tp) => (
              <div key={tp.topic} className="np-src-topic">
                <span className="np-src-topic-name">{topicName(tp.topic)}</span>
                <div className="np-src-topic-track"><span className="np-src-topic-dot" style={{ left: `${clamp(tp.mean, 2, 98)}%` }} /></div>
              </div>
            ))
          ) : (
            <div className="np-src-ev-note">{t('sources.detail.noTopics')}</div>
          )}
        </div>
        <div className="np-src-soft">
          <div className="np-src-soft-title">{t('sources.detail.reliability')}</div>
          <div className="np-src-rel">{o.reliability ? `${pct(o.reliability.ratio)} %` : '—'}</div>
          <div className="np-src-ev-note">{o.reliability ? t('sources.detail.reliabilityNote', { n: o.reliability.n }) : t('sources.detail.reliabilityNone')}</div>
        </div>
      </div>

      <div className="np-src-ovr">
        <div className="np-src-ovr-head">
          <label htmlFor={`np-src-ovr-${o.outletId}`} className="np-src-ovr-label">{t('sources.settings.override')}</label>
          <span className="np-mono np-src-ovr-val">{Math.round(draft)}</span>
        </div>
        <input
          id={`np-src-ovr-${o.outletId}`}
          className="np-src-range"
          type="range" min={0} max={100} step={1}
          value={draft}
          aria-label={t('sources.settings.overrideLabel', { outlet: o.name })}
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
          onBlur={(e) => { if (Number(e.target.value) !== shown) commit(Number(e.target.value)); }}
        />
        <div className="np-src-ovr-foot">
          <span className="np-src-ev-note">{t('sources.detail.overrideHint')}</span>
          <Button className="np-set-btn" disabled={ovr === null} onClick={() => onOverride(null)}>{t('sources.detail.reset')}</Button>
        </div>
      </div>

      <div className="np-src-note">{t('sources.detail.neverChanges')}</div>
    </div>
  );
}
