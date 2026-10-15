import { useI18n } from '@newpaper/i18n/react';
import type { UnverifiedReport } from '@newpaper/pipeline';
import { FramingAxis, NeutralityRing, VerdictTag } from '@newpaper/ui-kit';
import { useState } from 'react';
import { getPipeline } from '../ai/pipeline';
import { ipc } from '../ipc';
import { analyze, readingState, STAGE_ORDER, useReading } from '../readingStore';
import { go } from '../router';

/** Hoja de analisis: progreso indeterminado mientras corre, luego neutralidad, afirmaciones con veredicto y, sin cobertura, la investigacion con consentimiento en cada uso. */
export function AnalysisSheet({ onClose }: { onClose(after?: () => void): void }) {
  const { t, formatNumber } = useI18n();
  const s = useReading();
  const r = s.full ?? s.quick;
  const [ack, setAck] = useState(false);
  const [asking, setAsking] = useState(false);
  const [report, setReport] = useState<UnverifiedReport | null>(null);
  const verdicts = new Map((r?.verdicts ?? []).map((v) => [v.claimId, v]));
  const investigate = async () => {
    const a = readingState().article;
    if (!a || !ack) return;
    setAsking(false);
    setAck(false); // en cada uso (§6.4)
    const p = await getPipeline();
    setReport(await p.investigateUncovered({ article: { url: a.url, title: a.title, text: a.text }, previous: r, acknowledged: true }));
  };
  return (
    <>
      <div className="m-scrim" onClick={() => onClose()} aria-hidden="true" />
      <div className="m-sheet" role="dialog" aria-modal="true" aria-label={t('analysis.panel.label')}>
        <div className="m-grab" />
        <div className="m-row" style={{ minHeight: 0, padding: '0 0 12px' }}>
          <strong className="m-title-sm" style={{ flex: 1 }}>{t('analysis.panel.analysis')}</strong>
          <button type="button" className="m-btn sec sm" onClick={() => onClose()}>{t('mobile.reading.close')}</button>
        </div>
        {s.busy ? (
          <div aria-busy="true" style={{ display: 'grid', gap: 10, padding: '8px 0 16px' }}>
            <p style={{ margin: 0 }}>{t('analysis.running')}</p>
            <span className="m-splash-bar" style={{ width: '100%', height: 4, position: 'relative', background: 'var(--np-chrome)' }}>
              <i style={{ background: 'var(--np-accent)', animation: 'm-bar 1.2s var(--m-ease-inout) infinite alternate' }} />
            </span>
            <ol className="m-steps" aria-label={t('analysis.panel.analysis')}>
              {STAGE_ORDER.filter((id) => s.stages[id]).map((id) => {
                const st = s.stages[id]!;
                return (
                  <li key={id} data-status={st}>
                    <i aria-hidden="true" />
                    <span>{t(`analysis.stage.${id}`)}</span>
                    <small>{t(`mobile.analysis.step.${st}`)}</small>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
        {s.error ? <p role="alert">{t('analysis.error', { message: s.error })}</p> : null}
        {r?.score ? (
          <>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '4px 0 12px' }}>
              <NeutralityRing value={r.score.neutrality} label={t('analysis.neutrality', { value: r.score.neutrality })} caption={t('analysis.neutralityCaption')} />
              <div>
                <p style={{ margin: 0 }}><strong>{t(`analysis.verdictText.${r.score.verdict}`)}</strong></p>
                <p className="np-muted" style={{ margin: 0 }}>{r.quick ? t('analysis.mode.quick') : t('analysis.mode.full')}</p>
              </div>
            </div>
            <FramingAxis
              framing={r.score.framing}
              interval={r.score.interval}
              groupCenter={null}
              others={[]}
              labels={{
                axis: t('analysis.axis.label'),
                me: t('analysis.axis.me'),
                left: t('analysis.axis.left'),
                center: t('analysis.axis.center'),
                right: t('analysis.axis.right'),
                article: t('analysis.axis.article'),
                band: t('analysis.axis.band'),
                groupCenter: t('analysis.axis.groupCenter'),
                notDeterminable: t('analysis.verdictText.no_determinable'),
              }}
            />
          </>
        ) : null}
        {r?.quick || !r ? (
          <div style={{ margin: '12px 0' }}>
            <button type="button" className="m-btn" disabled={!!s.busy} onClick={() => void analyze('full')}>{t('analysis.actions.full')}</button>
          </div>
        ) : null}
        {(r?.claims?.claims ?? []).map((c) => {
          const v = verdicts.get(c.id);
          return (
            <div key={c.id} className="m-card" style={{ margin: '0 0 10px', width: '100%' }}>
              <p>{'«'}{c.quote}{'»'}</p>
              {v ? <VerdictTag status={v.status} label={t(`analysis.verdict.${v.status}`)} /> : null}
              {v ? <p className="np-muted">{v.explanation}</p> : null}
            </div>
          );
        })}
        {r?.aiAuthorship ? (
          <p className="np-muted">
            {t('analysis.ai.probability', { value: formatNumber(r.aiAuthorship.probability, { style: 'percent' }) })} · {t('analysis.ai.disclaimer')}
          </p>
        ) : null}
        {r?.uncovered ? (
          <div className="np-nocov" style={{ margin: '12px 0', padding: 14 }}>
            <p><strong>{t('noCoverage.title')}</strong></p>
            <div className="m-btn-row" style={{ padding: 0 }}>
              <button type="button" className="m-btn sec sm" onClick={() => void ipc.watchAdd({ articleUrl: r.url })}>{t('noCoverage.watch')}</button>
              <button type="button" className="m-btn sm" onClick={() => setAsking(true)}>{t('noCoverage.investigate')}</button>
            </div>
            {asking ? (
              <div role="dialog" aria-modal="true" aria-label={t('noCoverage.consent.title')}>
                <p>{t('noCoverage.consent.body')}</p>
                <label className="np-check">
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  <span>{t('noCoverage.consent.checkbox')}</span>
                </label>
                <div className="m-btn-row" style={{ padding: 0 }}>
                  <button type="button" className="m-btn sec sm" onClick={() => { setAsking(false); setAck(false); }}>{t('noCoverage.consent.cancel')}</button>
                  <button type="button" className="m-btn sm" disabled={!ack} onClick={() => void investigate()}>{t('noCoverage.consent.confirm')}</button>
                </div>
              </div>
            ) : null}
            {report ? (
              <div className="m-card" style={{ margin: 0 }}>
                <span className="np-tag np-tag--warn">{t('noCoverage.report.badge')}</span>
                {report.claims.map((c, i) => (
                  <p key={i}>{c.text} <span className="np-tag np-tag--muted">{t(`noCoverage.tags.${c.tag}`)}</span></p>
                ))}
                <p><strong>{t('noCoverage.report.howToCheck')}</strong></p>
                <ol>{report.howToCheck.map((h, i) => <li key={i}>{h}</li>)}</ol>
              </div>
            ) : null}
          </div>
        ) : null}
        <div style={{ marginTop: 8 }}>
          <button type="button" className="m-btn sec" onClick={() => onClose(() => go('agente', { u: readingState().url ?? '' }))}>{t('mobile.reading.askAgent')}</button>
        </div>
      </div>
    </>
  );
}
