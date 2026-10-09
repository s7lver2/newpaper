import { useI18n } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { Bucket, Coverage, CoverageResult, TabInfo } from '../../ipc/types';
import { navigate, openInternal } from '../../shell/navigate';
import { latestResult, useTabAnalysis } from './controller';

const BUCKETS: Bucket[] = ['left', 'center', 'right', 'unknown'];

export function CoverageTab({ tab }: { tab: TabInfo }) {
  const { t, formatNumber } = useI18n();
  const a = useTabAnalysis(tab.id);
  const fromAnalysis = latestResult(a)?.coverage as CoverageResult | null | undefined;
  const [fetched, setFetched] = useState<{ url: string; data: CoverageResult | null; error: boolean } | null>(null);
  const [watching, setWatching] = useState(false);
  const url = a?.url ?? tab.url.split('#')[0]!;

  useEffect(() => {
    if (fromAnalysis || !a || fetched?.url === url) return;
    let alive = true;
    commands
      .coverageFor(url, a.article.title, a.article.text.slice(0, 600))
      .then((data) => alive && setFetched({ url, data, error: false }))
      .catch(() => alive && setFetched({ url, data: null, error: true }));
    return () => {
      alive = false;
    };
  }, [a, url, fromAnalysis, fetched?.url]);

  const data = fromAnalysis ?? (fetched?.url === url ? fetched.data : null);
  if (!a) return <p className="np-panel-empty">{t('coverage.needsArticle')}</p>;
  if (!data) return <p className="np-panel-empty" aria-busy={!fetched?.error}>{fetched?.error ? t('coverage.error') : t('coverage.loading')}</p>;

  const groups = BUCKETS.map((b) => ({ b, items: data.coverages.filter((c) => c.bucket === b) })).filter((g) => g.items.length);
  const lean = (c: Coverage) =>
    c.lean === null ? t('coverage.leanUnknown') : c.leanUncertainty ? `${formatNumber(Math.round(c.lean))} ± ${formatNumber(Math.round(c.leanUncertainty))}` : formatNumber(Math.round(c.lean));

  return (
    <section className="np-coverage" aria-label={t('coverage.title')}>
      <p className="np-coverage-summary">{t('coverage.summary', { outlets: data.outletCount })}</p>
      {data.searchSkipped === 'no_key' ? <p className="np-hint">{t('coverage.noSearchKey')}</p> : null}
      {data.searchSkipped === 'network' ? <p className="np-hint">{t('coverage.searchFailed')}</p> : null}
      {groups.map((g) => (
        <div key={g.b} className={`np-coverage-group np-coverage-group--${g.b}`}>
          <h3>{t(`coverage.bucket.${g.b}`)}</h3>
          <ul>
            {g.items.map((c) => (
              <li key={c.url}>
                <button type="button" className="np-link" onClick={() => void navigate(c.url, { newTab: true })}>
                  <span className="np-coverage-outlet">{c.outlet}</span>
                  <span className="np-coverage-title">{c.title}</span>
                </button>
                <span className="np-mono" title={t('coverage.leanTitle')}>{lean(c)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <div className="np-coverage-actions">
        {!data.enough ? (
          <Button
            disabled={watching}
            onClick={() => void commands.watchAdd({ articleUrl: url, eventId: data.eventId ?? undefined }).then(() => setWatching(true))}
          >
            {watching ? t('noCoverage.watching') : t('noCoverage.watch')}
          </Button>
        ) : null}
        <Button variant="quiet" onClick={() => void openInternal('ajustes', ['fuentes'])}>
          {t('coverage.howMeasured')}
        </Button>
      </div>
    </section>
  );
}
