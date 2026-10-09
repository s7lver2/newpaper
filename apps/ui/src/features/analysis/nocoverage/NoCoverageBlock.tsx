import { useT } from '@newpaper/i18n/react';
import type { UnverifiedReport } from '@newpaper/pipeline';
import { Button } from '@newpaper/ui-kit';
import { useState } from 'react';
import { commands } from '../../../ipc/commands';
import { getPipeline } from '../../ai/pipeline';
import { latestResult, type TabAnalysis } from '../controller';
import { ConsentDialog } from './ConsentDialog';
import { UnverifiedCard } from './UnverifiedCard';

export function NoCoverageBlock({ analysis }: { analysis: TabAnalysis }) {
  const t = useT();
  const result = latestResult(analysis);
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

  return (
    <section className="np-nocov" aria-label={t('noCoverage.title')}>
      <h3>{t('noCoverage.title')}</h3>
      <p>{t('noCoverage.body', { outlets: result.coverage?.outletCount ?? 0 })}</p>
      <div className="np-nocov-actions">
        <Button variant="primary" disabled={state.busy} onClick={() => setAsking(true)}>
          {state.busy ? t('noCoverage.investigating') : t('noCoverage.investigate')}
        </Button>
        <Button disabled={state.watching} onClick={() => void watch()}>
          {state.watching ? t('noCoverage.watching') : t('noCoverage.watch')}
        </Button>
      </div>
      {state.error ? <p role="alert" className="np-agent-error">{state.error}</p> : null}
      {state.report ? <UnverifiedCard report={state.report} /> : null}
      <ConsentDialog open={asking} onConfirm={(ack) => void investigate(ack)} onCancel={() => setAsking(false)} />
    </section>
  );
}
