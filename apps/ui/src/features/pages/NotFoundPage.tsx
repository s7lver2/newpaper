import { useI18n } from '@newpaper/i18n/react';
import { useEffect, useState } from 'react';
import type { InternalPageProps } from '../../shell/registry';

export const COLUMNS = ['erratas', 'chiste', 'necrologica', 'anuncio', 'horoscopo', 'ultimaHora'] as const;
export const ROTATE_MS = 7000;

/** Usada como página interna (recibe `url` y `tab`, que no necesita) y como superficie de error (`address`). */
export function NotFoundPage({ address }: Partial<InternalPageProps> & { address?: string }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (reduced) return;
    const h = setInterval(() => setI((x) => (x + 1) % COLUMNS.length), ROTATE_MS);
    return () => clearInterval(h);
  }, [reduced]);
  const col = COLUMNS[i]!;
  return (
    <article className="np-404">
      <p className="np-404-kicker">{t('pages.notFound.kicker')}</p>
      <h1>{t('pages.notFound.title')}</h1>
      <p className="np-404-lead">{t('pages.notFound.lead', { address: address ?? '' })}</p>
      <section className="np-404-column np-rise" key={col} aria-live="polite">
        <h2>{t(`pages.notFound.columns.${col}.title`)}</h2>
        <p>{t(`pages.notFound.columns.${col}.body`)}</p>
      </section>
      <nav className="np-404-dots" aria-label={t('pages.notFound.columnsLabel')}>
        {COLUMNS.map((c, k) => (
          <button key={c} type="button" aria-label={t(`pages.notFound.columns.${c}.title`)} aria-current={k === i ? 'true' : undefined} onClick={() => setI(k)} />
        ))}
      </nav>
    </article>
  );
}
