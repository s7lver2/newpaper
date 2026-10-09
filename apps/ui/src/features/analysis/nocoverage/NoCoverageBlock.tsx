import { useI18n } from '@newpaper/i18n/react';
import type { UnverifiedReport } from '@newpaper/pipeline';
import { useEffect, useState } from 'react';
import { commands } from '../../../ipc/commands';
import { getPipeline } from '../../ai/pipeline';
import { latestResult, type TabAnalysis } from '../controller';
import { ConsentDialog } from './ConsentDialog';
import { UnverifiedCard } from './UnverifiedCard';

let outletCountP: Promise<number> | null = null;
/** Medios que revisa la app (los de la lista de fuentes). */
export function useOutletCount(): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    outletCountP ??= commands.outletsList().then((o) => o.length).catch(() => 0);
    let alive = true;
    void outletCountP.then((v) => alive && setN(v));
    return () => {
      alive = false;
    };
  }, []);
  return n;
}

export function NoCoverageBlock({ analysis }: { analysis: TabAnalysis }) {
  const { t, formatNumber } = useI18n();
  const result = latestResult(analysis);
  const outlets = useOutletCount();
  const [asking, setAsking] = useState(false);
  const [state, setState] = useState<{ busy: boolean; report: UnverifiedReport | null; error: string | null; watching: boolean }>({ busy: false, report: null, error: null, watching: false });
  if (!result?.uncovered) return null;

  const investigate = async (acknowledged: true) => {
    setAsking(false);
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const p = await getPipeline();
      const report = await p.investigateUncovered({ article: analysis.article, previous: result, acknowledged });
      setState((s) => ({ ...s, busy: false, report }));
    } catch (e) {
      setState((s) => ({ ...s, busy: false, error: e instanceof Error ? e.message : String(e) }));
    }
  };
  const watch = async () => {
    await commands.watchAdd({ articleUrl: analysis.url });
    setState((s) => ({ ...s, watching: true }));
  };
  const stats: [string, string][] = [
    [formatNumber(result.coverage?.outletCount ?? 0), t('noCoverage.stats.coverages')],
    [formatNumber(result.sources.filter((s) => s.kind === 'primary').length), t('noCoverage.stats.official')],
    [outlets === null ? '—' : formatNumber(outlets), t('noCoverage.stats.outlets')],
  ];

  return (
    <section className="np-nocov np-rise" aria-label={t('noCoverage.title')}>
      <div className="np-nocov-head">
        <span className="np-nocov-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4M8 11h6" />
          </svg>
        </span>
        <div>
          <h3>{t('noCoverage.title')}</h3>
          <p>{t('noCoverage.body', { outlets: result.coverage?.outletCount ?? 0 })}</p>
        </div>
      </div>
      <dl className="np-nocov-stats">
        {stats.map(([v, l]) => (
          <div key={l}>
            <dt>{v}</dt>
            <dd>{l}</dd>
          </div>
        ))}
      </dl>
      <div className="np-nocov-actions">
        <button type="button" className={`np-nocov-watch${state.watching ? ' np-nocov-watch--on' : ''}`} disabled={state.watching} onClick={() => void watch()}>
          {state.watching ? t('noCoverage.watching') : t('noCoverage.watch')}
        </button>
        <button type="button" className="np-nocov-investigate" disabled={state.busy} onClick={() => setAsking(true)}>
          {t('noCoverage.investigate')}
        </button>
      </div>
      {state.busy ? (
        <div className="np-nocov-busy np-rise" role="status">
          <span aria-hidden="true" />
          {t('noCoverage.investigating')}
        </div>
      ) : null}
      {state.error ? <p role="alert" className="np-agent-error">{state.error}</p> : null}
      {state.report ? <UnverifiedCard report={state.report} /> : null}
      <ConsentDialog open={asking} onConfirm={(ack) => void investigate(ack)} onCancel={() => setAsking(false)} />
    </section>
  );
}
