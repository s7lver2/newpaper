import { useI18n } from '@newpaper/i18n/react';
import type { StageId } from '@newpaper/pipeline';
import { Button, FramingAxis, NeutralityRing, StageList, VerdictTag, type StageItem } from '@newpaper/ui-kit';
import { useEffect, useRef } from 'react';
import type { TabInfo } from '../../ipc/types';
import { navigate, openInternal } from '../../shell/navigate';
import { useArticle } from '../../state/browser';
import { useSetting } from '../../state/settings';
import { useAxisLabels } from './axisLabels';
import { controller, latestResult, useTabAnalysis } from './controller';
import { NoCoverageBlock } from './nocoverage/NoCoverageBlock';
import { panelStore, usePanel } from './panelStore';

const FULL_STAGES: StageId[] = ['claims', 'verify', 'score', 'synthesis', 'aiDetect'];

export function AnalysisTab({ tab }: { tab: TabInfo }) {
  const { t, formatNumber } = useI18n();
  const axis = useAxisLabels();
  const a = useTabAnalysis(tab.id);
  const page = useArticle(tab.id)?.article;
  const result = latestResult(a);
  const focus = usePanel((s) => s.focusClaim);
  const [detector] = useSetting<boolean>('ai.detector', true);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (focus) list.current?.querySelector(`[data-claim="${focus}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focus]);

  if (!page) return <p className="np-panel-empty">{t('analysis.needsArticle')}</p>;
  const running = a?.phase === 'quick' || a?.phase === 'full';
  if (!result) {
    return (
      <div className="np-panel-empty">
        <p>{running ? t('analysis.running') : t('analysis.empty')}</p>
        {!running ? (
          <Button variant="primary" onClick={() => void controller.analyzeFull(tab.id, page)}>
            {t('analysis.actions.analyze')}
          </Button>
        ) : null}
      </div>
    );
  }

  const score = result.score;
  const verdicts = new Map((result.verdicts ?? []).map((v) => [v.claimId, v]));
  const known = (result.coverage?.coverages ?? []).map((c) => c.lean).filter((l): l is number => l !== null);
  const groupCenter = known.length ? known.reduce((x, y) => x + y, 0) / known.length : null;
  const stages: StageItem[] =
    a?.phase === 'full' || result === a?.full
      ? FULL_STAGES.map((id) => {
          const status = a?.stages[id] ?? (result.failed.includes(id) ? 'failed' : 'pending');
          return { id, label: t(`analysis.stage.${id}`), status, statusLabel: t(`analysis.stageStatus.${status}`) };
        })
      : [];
  const ai = detector ? result.aiAuthorship : null;

  return (
    <div className="np-atab">
      <header className="np-atab-head">
        <NeutralityRing value={score?.neutrality ?? null} label={t('analysis.neutrality', { value: score?.neutrality ?? 0 })} caption={t('analysis.neutralityCaption')} />
        <div>
          <p className="np-atab-verdict">{score ? t(`analysis.verdictText.${score.verdict}`) : t('analysis.noScore')}</p>
          <p className="np-tag np-tag--muted">{result.quick ? t('analysis.mode.quick') : t('analysis.mode.full')}</p>
          {result.quick ? (
            <Button variant="quiet" disabled={running} onClick={() => void controller.analyzeFull(tab.id, page)}>
              {t('analysis.actions.full')}
            </Button>
          ) : null}
        </div>
      </header>

      {result.capped ? <p className="np-hint">{t('analysis.capped')}</p> : null}
      {a?.error ? <p className="np-agent-error" role="alert">{t('analysis.error', { message: a.error })}</p> : null}

      {score ? (
        <section aria-label={t('analysis.axis.label')}>
          <FramingAxis framing={score.framing} interval={score.interval} groupCenter={groupCenter} others={[]} labels={axis} />
          {score.crossModelDisagreement ? <p className="np-hint">{t('analysis.disagreement')}</p> : null}
          <Button variant="quiet" onClick={() => panelStore.set({ detail: 'position' })}>
            {t('analysis.whyPosition')}
          </Button>
        </section>
      ) : null}

      <NoCoverageBlock analysis={a!} />

      {result.claims?.claims.length ? (
        <section aria-label={t('analysis.claims.title')}>
          <h3>{t('analysis.claims.title')}</h3>
          <ol ref={list} className="np-claims">
            {result.claims.claims.map((c) => {
              const v = verdicts.get(c.id);
              return (
                <li key={c.id} data-claim={c.id} className={focus === c.id ? 'np-claim np-claim--focus' : 'np-claim'}>
                  <p className="np-claim-quote">«{c.quote}»</p>
                  {v ? <VerdictTag status={v.status} label={t(`analysis.verdict.${v.status}`)} /> : <span className="np-tag np-tag--muted">{t('analysis.verdict.pendiente')}</span>}
                  {v ? <p className="np-claim-why">{v.explanation}</p> : null}
                  {v?.sources.length ? (
                    <p className="np-claim-sources">
                      {v.sources.map((s) => (
                        <button key={s.id} type="button" className="np-link" onClick={() => void navigate(s.url, { newTab: true })}>
                          {s.title}
                        </button>
                      ))}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
      {result.claims?.loadedPhrases.length ? <p className="np-muted">{t('analysis.loadedCount', { n: result.claims.loadedPhrases.length })}</p> : null}

      {ai ? (
        <section className={ai.probability >= 0.5 ? 'np-ai np-ai--high' : 'np-ai'} aria-label={t('analysis.ai.title')}>
          <strong>{t('analysis.ai.probability', { value: formatNumber(ai.probability, { style: 'percent' }) })}</strong>
          <p className="np-muted">{t('analysis.ai.disclaimer')}</p>
          <ul>
            {ai.signals.map((s) => (
              <li key={s.key}>{t(`analysis.ai.signal.${s.key}`)}: <span className="np-mono">{formatNumber(s.strength, { maximumFractionDigits: 2 })}</span></li>
            ))}
          </ul>
        </section>
      ) : null}

      {stages.length ? <StageList items={stages} label={t('analysis.stagesLabel')} /> : null}

      <div className="np-atab-links">
        {result.synthesis ? (
          <Button onClick={() => void openInternal('sintesis', [], { url: result.url, hash: result.hash })}>{t('analysis.actions.synthesis')}</Button>
        ) : null}
        <Button variant="quiet" onClick={() => void openInternal('hemeroteca', [], { url: result.url })}>
          {t('analysis.actions.hemeroteca')}
        </Button>
      </div>
    </div>
  );
}
