import { useI18n } from '@newpaper/i18n/react';
import type { UnverifiedReport } from '@newpaper/pipeline';
import { Button, FramingAxis, NeutralityRing, VerdictTag } from '@newpaper/ui-kit';
import { useState } from 'react';
import { getPipeline } from '../ai/pipeline';
import { ipc } from '../ipc';
import { analyze, readingState, useReading } from '../readingStore';
import { go } from '../router';

/** Hoja de analisis: neutralidad, afirmaciones con veredicto y, sin cobertura, la investigacion con consentimiento en cada uso. */
export function AnalysisSheet({ onClose }: { onClose(): void }) {
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
    <div className="m-sheet" role="dialog" aria-modal="true" aria-label={t('analysis.panel.label')}>
      <div className="m-row">
        <strong>{t('analysis.panel.analysis')}</strong>
        <Button variant="quiet" onClick={onClose}>{t('mobile.reading.close')}</Button>
      </div>
      {s.busy ? <p aria-busy="true">{t('analysis.running')}</p> : null}
      {s.error ? <p role="alert">{t('analysis.error', { message: s.error })}</p> : null}
      {r?.score ? (
        <>
          <div className="m-row">
            <NeutralityRing value={r.score.neutrality} label={t('analysis.neutrality', { value: r.score.neutrality })} caption={t('analysis.neutralityCaption')} />
            <div>
              <p><strong>{t(`analysis.verdictText.${r.score.verdict}`)}</strong></p>
              <p className="np-muted">{r.quick ? t('analysis.mode.quick') : t('analysis.mode.full')}</p>
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
      {r?.quick || !r ? <Button variant="primary" disabled={!!s.busy} onClick={() => void analyze('full')}>{t('analysis.actions.full')}</Button> : null}
      {(r?.claims?.claims ?? []).map((c) => {
        const v = verdicts.get(c.id);
        return (
          <div key={c.id} className="m-card">
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
        <div className="np-nocov">
          <p><strong>{t('noCoverage.title')}</strong></p>
          <div className="m-row">
            <Button onClick={() => void ipc.watchAdd({ articleUrl: r.url })}>{t('noCoverage.watch')}</Button>
            <Button variant="primary" onClick={() => setAsking(true)}>{t('noCoverage.investigate')}</Button>
          </div>
          {asking ? (
            <div role="dialog" aria-modal="true" aria-label={t('noCoverage.consent.title')}>
              <p>{t('noCoverage.consent.body')}</p>
              <label className="np-check">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>{t('noCoverage.consent.checkbox')}</span>
              </label>
              <div className="m-row">
                <Button onClick={() => { setAsking(false); setAck(false); }}>{t('noCoverage.consent.cancel')}</Button>
                <Button variant="primary" disabled={!ack} onClick={() => void investigate()}>{t('noCoverage.consent.confirm')}</Button>
              </div>
            </div>
          ) : null}
          {report ? (
            <div className="m-card">
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
      <Button onClick={() => go('agente')}>{t('mobile.reading.askAgent')}</Button>
    </div>
  );
}
