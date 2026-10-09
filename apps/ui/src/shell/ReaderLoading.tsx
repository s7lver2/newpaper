import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { commands } from '../ipc/commands';
import type { TabInfo } from '../ipc/types';
import { IconBack } from './icons';

/** ¿Lo que se carga parece una portada o sección (selector de artículos) o un artículo? Solo por la URL. */
export function guessSurface(url: string): 'article' | 'listing' {
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    if (segs.length === 0) return 'listing';
    if (/\.(html?|shtml|php|aspx?)$/i.test(u.pathname) || /\/\d{4}\/\d{1,2}\//.test(u.pathname)) return 'article';
    // Una sola ruta corta ("/espana", "/news") suele ser una sección; las rutas con guiones, un artículo.
    return (segs[segs.length - 1] ?? '').includes('-') ? 'article' : 'listing';
  } catch {
    return 'article';
  }
}

const host = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const rise = (i: number) => ({ animationDelay: `${i * 70}ms` });

/**
 * Superficie de carga del lector: se ve mientras la página se carga y se clasifica, en lugar de la web original
 * (que no debe verse si va a abrirse el lector). Piel de lo que vendrá: artículo o selector de portada.
 */
export function ReaderLoading({ tab }: { tab: TabInfo }) {
  const t = useT();
  const kind = guessSurface(tab.url);
  const site = host(tab.url);
  return (
    <div className="np-surface np-reader-loading" data-kind={kind} role="status" aria-busy="true" aria-live="polite">
      <div className="np-reader-actions">
        <Button variant="quiet" className="np-reader-orig np-press-spring" aria-label={t('shell.reader.original')} onClick={() => commands.tabSetView(tab.id, 'original')}>
          <IconBack />
          <span>{t('shell.reader.original')}</span>
        </Button>
      </div>
      <div className="np-rl-column">
        <p className="np-rl-kicker np-rise" style={rise(0)}>
          <span className="np-rl-mark" aria-hidden="true">{site.charAt(0).toUpperCase()}</span>
          <span>{site}</span>
        </p>
        {kind === 'article' ? (
          <>
            <div className="np-rl-bar np-rl-title" style={rise(1)} aria-hidden="true" />
            <div className="np-rl-bar np-rl-title np-rl-w70" style={rise(2)} aria-hidden="true" />
            <div className="np-rl-bar np-rl-meta" style={rise(3)} aria-hidden="true" />
            <div className="np-rl-rule" aria-hidden="true" />
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className={`np-rl-bar np-rl-line${i % 3 === 2 ? ' np-rl-w85' : ''}`} style={rise(4 + i)} aria-hidden="true" />
            ))}
          </>
        ) : (
          <div className="np-rl-grid" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="np-rl-card np-rise" style={rise(1 + i)}>
                <div className="np-rl-bar np-rl-thumb" />
                <div className="np-rl-bar np-rl-line" />
                <div className="np-rl-bar np-rl-line np-rl-w70" />
              </div>
            ))}
          </div>
        )}
        <p className="np-rl-text np-rise" style={rise(kind === 'article' ? 11 : 8)}>
          {kind === 'article' ? t('shell.reader.loadingArticle') : t('shell.reader.loadingListing')}
          <span className="np-rl-hint">{t('shell.reader.loadingHint')}</span>
        </p>
      </div>
    </div>
  );
}
