import { useI18n } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import type { InternalPageProps } from '../../shell/registry';

export const COLUMNS = ['erratas', 'chiste', 'necrologica', 'anuncio', 'horoscopo', 'ultimaHora'] as const;
export const ROTATE_MS = 7000;
const TILT = [-4, 3, -2];

/** Usada como página interna (recibe `url` y `tab`, que no necesita) y como superficie de error (`address`). */
export function NotFoundPage({ address, actions }: Partial<InternalPageProps> & { address?: string; actions?: { label: string; run: () => void }[] }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [flips, setFlips] = useState([0, 0, 0]);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (reduced || paused) return;
    const h = setInterval(() => setI((x) => (x + 1) % COLUMNS.length), ROTATE_MS);
    return () => clearInterval(h);
  }, [reduced, paused, i]);
  const col = COLUMNS[i]!;
  const go = (d: number) => setI((x) => (x + d + COLUMNS.length) % COLUMNS.length);
  return (
    <article className="np-sp np-404">
      <div className="np-sp-main np-404-main">
        <div className="np-404-types" aria-hidden="true">
          {['4', '0', '4'].map((ch, k) => (
            <button
              key={k}
              type="button"
              tabIndex={-1}
              className="np-404-type"
              style={{ transform: `rotate(${TILT[k]}deg)`, animationDelay: `${k * 140}ms` }}
              onClick={() => setFlips((f) => f.map((n, j) => (j === k ? n + 1 : n)))}
            >
              <span key={flips[k]} data-flip={flips[k]! % 2} className={flips[k] ? 'np-404-flip' : undefined}>{ch}</span>
            </button>
          ))}
        </div>
        <div className="np-rise" style={{ animationDelay: '700ms' }}>
          <p className="np-sp-kicker np-sp-kicker--bad">404 · {t('pages.notFound.kicker')}</p>
          <h1>{t('pages.notFound.title')}</h1>
          <p className="np-sp-lead np-404-lead">{t('pages.notFound.lead', { address: address ?? '' })}</p>
          {actions?.length ? (
            <div className="np-sp-actions">
              {actions.map((a, k) => (
                <Button key={a.label} variant={k === 0 ? 'primary' : 'secondary'} onClick={a.run}>{a.label}</Button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="np-404-card np-rise" style={{ animationDelay: '900ms' }} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className="np-404-cardhead">
          <span className="np-404-coltitle">{t(`pages.notFound.columns.${col}.title`)}</span>
          <nav className="np-404-nav" aria-label={t('pages.notFound.columnsLabel')}>
            <button type="button" aria-label={t('pages.notFound.prev')} onClick={() => go(-1)}>‹</button>
            <span className="np-404-dots">
              {COLUMNS.map((c, k) => (
                <button key={c} type="button" aria-label={t(`pages.notFound.columns.${c}.title`)} aria-current={k === i ? 'true' : undefined} onClick={() => setI(k)} />
              ))}
            </span>
            <button type="button" aria-label={t('pages.notFound.next')} onClick={() => go(1)}>›</button>
          </nav>
        </div>
        <section className="np-404-column" key={col} aria-live="polite">
          <p>{t(`pages.notFound.columns.${col}.body`)}</p>
        </section>
      </div>
    </article>
  );
}
