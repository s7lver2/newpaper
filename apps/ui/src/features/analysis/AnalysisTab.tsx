import { useI18n } from '@newpaper/i18n/react';
import type { AnalysisResult, StageId } from '@newpaper/pipeline';
import { FramingAxis, NeutralityRing, StageList, type StageItem } from '@newpaper/ui-kit';
import { useEffect, useRef } from 'react';
import type { TabInfo } from '../../ipc/types';
import { navigate, openInternal } from '../../shell/navigate';
import { useArticle } from '../../state/browser';
import { useSetting } from '../../state/settings';
import { notableAi } from './aiParagraphs';
import { useAxisLabels } from './axisLabels';
import { controller, latestResult, useTabAnalysis } from './controller';
import { NoCoverageBlock } from './nocoverage/NoCoverageBlock';
import { panelStore, usePanel } from './panelStore';
import { useTier } from './useTier';

const FULL_STAGES: StageId[] = ['claims', 'verify', 'score', 'synthesis', 'aiDetect'];
const level = (s: number) => (s >= 0.66 ? 'high' : s >= 0.33 ? 'medium' : 'low');

function AiDetail({ result }: { result: AnalysisResult }) {
  const { t } = useI18n();
  const ai = result.aiAuthorship;
  if (!ai) return null;
  return (
    <div className="np-ai-detail np-rise">
      <div className="np-ai-signals">
        {ai.signals.map((s) => (
          <div key={s.key} className="np-ai-signal">
            <span>{t(`analysis.ai.signal.${s.key}`)}</span>
            <strong>{t(`analysis.ai.level.${level(s.strength)}`)}</strong>
            <span className="np-ai-bar"><span style={{ width: `${Math.round(Math.max(0, Math.min(1, s.strength)) * 100)}%` }} /></span>
          </div>
        ))}
      </div>
      <p>{t('analysis.ai.disclaimer')}</p>
    </div>
  );
}

export function AnalysisTab({ tab }: { tab: TabInfo }) {
  const { t, formatNumber } = useI18n();
  const axis = useAxisLabels();
  const a = useTabAnalysis(tab.id);
  const page = useArticle(tab.id)?.article;
  const result = latestResult(a);
  const focus = usePanel((s) => s.focusClaim);
  const aiOpen = usePanel((s) => s.aiOpen);
  const [detector] = useSetting<boolean>('ai.detector', true);
  const list = useRef<HTMLOListElement>(null);
  const tier = useTier(result);

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
          <button type="button" className="np-cta" onClick={() => void controller.analyzeFull(tab.id, page)}>
            {t('analysis.actions.verify')}
          </button>
        ) : null}
      </div>
    );
  }

  const score = result.score;
  const claims = result.claims?.claims ?? [];
  const verdicts = new Map((result.verdicts ?? []).map((v) => [v.claimId, v]));
  const coverages = result.coverage?.coverages ?? [];
  const known = coverages.filter((c) => c.lean !== null);
  const groupCenter = known.length ? known.reduce((x, y) => x + (y.lean as number), 0) / known.length : null;
  const full = !result.quick;
  const stages: StageItem[] =
    a?.phase === 'full'
      ? FULL_STAGES.map((id) => {
          const status = a?.stages[id] ?? (result.failed.includes(id) ? 'failed' : 'pending');
          return { id, label: t(`analysis.stage.${id}`), status, statusLabel: t(`analysis.stageStatus.${status}`) };
        })
      : [];
  const notable = detector ? notableAi(page.text, result.aiAuthorship) : null;
  const ai = notable?.ai ?? null;
  const aiParas = notable?.paras ?? null;
  const verified = [...verdicts.values()].filter((v) => v.status === 'verificado').length;
  const cifras = claims.filter((c) => c.kind === 'cifra');
  const exact = cifras.filter((c) => verdicts.get(c.id)?.status === 'verificado').length;
  const actors = score?.voices.actors.length ?? 0;
  const metrics: [string, string][] = [
    [String(result.claims?.loadedPhrases.length ?? 0), t('analysis.metrics.loaded')],
    [full && score ? String(actors) : '—', t('analysis.metrics.voices')],
    [full && cifras.length ? `${exact}/${cifras.length}` : '—', t('analysis.metrics.figures')],
    [full && score ? String(score.omissions.length) : '—', t('analysis.metrics.omissions')],
  ];
  const note = full ? (claims.length ? t('analysis.note.full', { verified, total: claims.length }) : result.failed.includes('claims') ? t('analysis.note.claimsFailed') : t('analysis.note.noClaims')) : t('analysis.note.quick');
  const toggleAi = () => panelStore.set((s) => ({ ...s, aiOpen: !s.aiOpen }));

  return (
    <div className="np-atab np-rise">
      <header className="np-atab-head">
        <NeutralityRing value={score?.neutrality ?? null} label={t('analysis.neutrality', { value: score?.neutrality ?? 0 })} caption={t('analysis.neutralityCaption')} />
        <div className="np-atab-head-text">
          <p className="np-atab-verdict">{score ? t(`analysis.verdictText.${score.verdict}`) : t('analysis.noScore')}</p>
          <p className="np-atab-note">{note}</p>
          <p className="np-atab-tier">{tier(coverages.length, result.sources.length)}</p>
        </div>
      </header>

      {result.capped ? <p className="np-hint">{t('analysis.capped')}</p> : null}
      {a?.error ? <p className="np-agent-error" role="alert">{t('analysis.error', { message: a.error })}</p> : null}

      {score ? (
        <section aria-label={t('analysis.axis.label')}>
          <h3 className="np-atab-kicker">{coverages.length ? t('analysis.axis.title', { n: coverages.length }) : t('analysis.axis.titleNone')}</h3>
          <FramingAxis
            framing={score.framing}
            interval={null}
            groupCenter={groupCenter}
            others={known.map((c) => ({ id: c.url, value: c.lean as number, title: c.outlet }))}
            labels={axis}
          />
          {score.crossModelDisagreement ? <p className="np-hint">{t('analysis.disagreement')}</p> : null}
          <button type="button" className="np-linkbtn" onClick={() => void openInternal('analisis', ['posicion'], { tab: String(tab.id) }, { newTab: true })}>
            {t('analysis.whyPosition')} →
          </button>
        </section>
      ) : null}

      <dl className="np-metrics">
        {metrics.map(([value, label]) => (
          <div key={label}>
            <dt>{value}</dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>

      {ai && aiParas ? (
        <div className="np-ai-row-wrap">
          <button type="button" className="np-ai-row" aria-expanded={aiOpen} aria-label={t('analysis.ai.toggle')} onClick={toggleAi}>
            <span className="np-ai-chip">{t('analysis.ai.badge')}</span>
            <span className="np-ai-row-text">{t('analysis.ai.row', { n: aiParas.flagged, total: aiParas.total })}</span>
            <span className="np-ai-row-value">{formatNumber(ai.probability, { style: 'percent' })}</span>
          </button>
          {aiOpen ? <AiDetail result={result} /> : null}
        </div>
      ) : null}

      <button type="button" className="np-hemeroteca-row" onClick={() => void openInternal('hemeroteca', [], { url: result.url })}>
        <span className="np-diamond" aria-hidden="true" />
        <span className="np-hemeroteca-row-text">{t('analysis.hemeroteca.row')}</span>
        <span className="np-hemeroteca-row-link">{t('analysis.hemeroteca.open')}</span>
      </button>

      <NoCoverageBlock analysis={a!} />

      {stages.length ? <StageList items={stages} label={t('analysis.stagesLabel')} /> : null}

      {result.quick && !running ? (
        <button type="button" className="np-cta" onClick={() => void controller.analyzeFull(tab.id, page)}>
          {t('analysis.actions.verify')}
        </button>
      ) : null}

      {claims.length ? (
        <section aria-label={t('analysis.claims.title')}>
          <h3 className="np-atab-kicker">{t('analysis.claims.title')}</h3>
          <ol ref={list} className="np-claims">
            {claims.map((c, i) => {
              const v = verdicts.get(c.id);
              const status = v?.status ?? 'pendiente';
              const open = focus === c.id;
              return (
                <li key={c.id} data-claim={c.id} className="np-claim np-rise" style={{ animationDelay: `${i * 110}ms` }}>
                  <button type="button" className="np-claim-row" aria-expanded={open} onClick={() => panelStore.set({ focusClaim: open ? null : c.id })}>
                    <span className={`np-claim-dot np-claim-dot--${status}`} aria-hidden="true" />
                    <span className="np-claim-main">
                      <span className="np-claim-quote">{c.quote}</span>
                      <span className={`np-claim-status np-claim-status--${status}`}>{v ? t(`analysis.verdict.${v.status}`) : t('analysis.claim.pending')}</span>
                    </span>
                    <span className="np-chev" aria-hidden="true">›</span>
                  </button>
                  {open ? (
                    <div className="np-claim-detail np-rise">
                      <p>{v ? v.explanation : t('analysis.claim.pendingDetail')}</p>
                      <div className="np-claim-foot">
                        <span className="np-claim-sources">
                          {v?.sources.length
                            ? v.sources.map((s) => (
                                <button key={s.id} type="button" className="np-link" onClick={() => void navigate(s.url, { newTab: true })}>
                                  {s.title}
                                </button>
                              ))
                            : v
                              ? t('analysis.claim.noSource')
                              : '—'}
                        </span>
                        <button type="button" className="np-claim-ask" onClick={() => panelStore.set((s) => ({ ...s, open: true, tab: 'agent', agentSeed: { fragment: c.quote, mode: 'ask', question: null } }))}>
                          {t('analysis.claim.ask')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}

      {result.synthesis ? (
        <button type="button" className="np-cta np-cta--ink" onClick={() => void openInternal('sintesis', [], { url: result.url, hash: result.hash })}>
          {t('analysis.actions.synthesis')}
        </button>
      ) : null}
    </div>
  );
}
