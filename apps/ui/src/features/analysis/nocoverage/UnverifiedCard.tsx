import { useI18n } from '@newpaper/i18n/react';
import type { UnverifiedReport } from '@newpaper/pipeline';
import { useState } from 'react';
import { navigate } from '../../../shell/navigate';

const level = (c: number) => (c >= 0.5 ? 'high' : c > 0.25 ? 'medium' : 'low');

/** Informe sin verificar (mockup SinCobertura): borde discontinuo ámbar, etiqueta por frase y «Cómo comprobarlo tú». */
export function UnverifiedCard({ report }: { report: UnverifiedReport }) {
  const { t } = useI18n();
  const [done, setDone] = useState<Record<number, boolean>>({});
  const lv = level(report.confidence);
  const bars = Math.max(1, Math.min(5, Math.round(report.confidence * 5)));
  return (
    <section className="np-unverified np-rise" aria-label={t('noCoverage.report.title')}>
      <header className="np-unverified-banner">
        <span className="np-unverified-badge">{t('noCoverage.report.badge')}</span>
        <span>{t('noCoverage.report.warning')}</span>
      </header>
      <div className="np-unverified-body">
        <div className="np-unverified-head">
          <h3>{t('noCoverage.report.title')}</h3>
          <div className="np-unverified-conf" role="img" aria-label={`${t('noCoverage.report.confidence')}: ${t(`noCoverage.report.level.${lv}`)}`}>
            <span>{t('noCoverage.report.confidence')}</span>
            <span className="np-unverified-bars">
              {[1, 2, 3, 4, 5].map((i) => (
                <i key={i} className={i <= bars ? 'on' : undefined} />
              ))}
            </span>
            <strong>{t(`noCoverage.report.level.${lv}`)}</strong>
          </div>
        </div>
        <ul className="np-unverified-claims">
          {report.claims.map((c, i) => (
            <li key={i} className="np-rise" style={{ animationDelay: `${i * 120}ms` }}>
              <span className={`np-unverified-tag np-unverified-tag--${c.tag}`}>{t(`noCoverage.tags.${c.tag}`)}</span>
              <div>
                <p>{c.text}</p>
                <small>{c.note}</small>
              </div>
            </li>
          ))}
        </ul>
        <div className="np-unverified-check">
          <h4>{t('noCoverage.report.howToCheck')}</h4>
          {report.howToCheck.map((h, i) => (
            <button key={i} type="button" role="checkbox" aria-checked={!!done[i]} onClick={() => setDone({ ...done, [i]: !done[i] })}>
              <span className="np-unverified-box" aria-hidden="true">{done[i] ? '✓' : ''}</span>
              <span className={done[i] ? 'np-unverified-done' : undefined}>{h}</span>
            </button>
          ))}
        </div>
        <p className="np-unverified-sources">
          <span>{t('noCoverage.report.sources', { n: report.sources.length })}</span>
          {report.sources.map((s, i) => (
            <button key={s.id} type="button" className="np-link" onClick={() => void navigate(s.url, { newTab: true })}>
              [{i + 1}] {s.title}
            </button>
          ))}
        </p>
      </div>
    </section>
  );
}
