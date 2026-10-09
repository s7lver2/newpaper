import { useI18n } from '@newpaper/i18n/react';
import type { UnverifiedReport } from '@newpaper/pipeline';
import { navigate } from '../../../shell/navigate';

export function UnverifiedCard({ report }: { report: UnverifiedReport }) {
  const { t, formatNumber } = useI18n();
  return (
    <section className="np-unverified" aria-label={t('noCoverage.report.title')}>
      <header>
        <span className="np-tag np-tag--warn">{t('noCoverage.report.badge')}</span>
        <span className="np-mono">{t('noCoverage.report.confidence', { value: formatNumber(report.confidence, { maximumFractionDigits: 2 }) })}</span>
      </header>
      <ul className="np-unverified-claims">
        {report.claims.map((c, i) => (
          <li key={i}>
            <span className="np-tag np-tag--muted">{t(`noCoverage.tags.${c.tag}`)}</span>
            <p>{c.text}</p>
            <p className="np-muted">{c.note}</p>
          </li>
        ))}
      </ul>
      <h3>{t('noCoverage.report.howToCheck')}</h3>
      <ol>
        {report.howToCheck.map((h, i) => (
          <li key={i}>{h}</li>
        ))}
      </ol>
      {report.sources.length ? (
        <p className="np-unverified-sources">
          {report.sources.map((s, i) => (
            <button key={s.id} type="button" className="np-link" onClick={() => void navigate(s.url, { newTab: true })}>
              [{i + 1}] {s.title}
            </button>
          ))}
        </p>
      ) : null}
    </section>
  );
}
