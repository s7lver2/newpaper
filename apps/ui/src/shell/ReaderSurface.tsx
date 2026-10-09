import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useI18n } from '@newpaper/i18n/react';
import { Button, ReaderView } from '@newpaper/ui-kit';
import { convertFileSrc } from '@tauri-apps/api/core';
import { commands } from '../ipc/commands';
import { useSetting } from '../state/settings';
import { navigate } from './navigate';
import { IconBack } from './icons';
import { ListingReader } from './ListingSurface';
import type { ReaderSurfaceProps } from './registry';

/** Imagen por el proxy `npimg`; `r` lleva la página para que Rust envíe el Referer (solo el origen). */
export const rewriteImage = (absUrl: string, pageUrl?: string): string => {
  const base = convertFileSrc(absUrl, 'npimg');
  return pageUrl ? `${base}?r=${encodeURIComponent(pageUrl)}` : base;
};

const IconLimited = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 018 0v4" />
  </svg>
);

/** Tamaños de texto del lector (px); el 2 es el predeterminado. */
export const READER_SIZES = [17, 18.5, 20, 22, 24];
const DEFAULT_STEP = 2;
const WORDS_PER_MINUTE = 220;

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export function DefaultReader(props: ReaderSurfaceProps) {
  return props.page.kind === 'listing' ? <ListingReader {...props} /> : <ArticleReader {...props} />;
}

function ArticleReader({ tab, page }: ReaderSurfaceProps) {
  const { t, formatDate } = useI18n();
  const a = page;
  const [step, setStep] = useSetting<number>('reader.sizeStep', DEFAULT_STEP);
  const [auto, setAuto] = useSetting<boolean>('reader.autoOpen', true);
  const [undo, setUndo] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const pageUrl = a.url;
  const rewrite = useCallback((abs: string) => rewriteImage(abs, pageUrl), [pageUrl]);

  useEffect(() => {
    if (!undo) return;
    const id = window.setTimeout(() => setUndo(false), 7000);
    return () => window.clearTimeout(id);
  }, [undo]);

  // Página nueva: vuelve arriba y reinicia la barra de progreso.
  useEffect(() => {
    surface.current?.scrollTo?.({ top: 0 });
    bar.current?.style.setProperty('--np-progress', '0');
  }, [a.url]);

  const onScroll = () => {
    const el = surface.current;
    if (!el || !bar.current) return;
    const max = el.scrollHeight - el.clientHeight;
    bar.current.style.setProperty('--np-progress', String(max > 0 ? Math.min(1, el.scrollTop / max) : 0));
  };

  const safeStep = Math.min(READER_SIZES.length - 1, Math.max(0, Math.round(step)));
  const published = a.published && !Number.isNaN(Date.parse(a.published)) ? formatDate(new Date(a.published), { dateStyle: 'long' }) : null;
  const words = a.text.trim() ? a.text.trim().split(/\s+/).length : 0;
  const minutes = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  // Muchas webs ya escriben «Por …»: se quita para no duplicarlo con el rótulo localizado.
  const byline = a.byline?.replace(/^\s*(por|by|von)\s+/i, '').trim() || null;
  const site = a.siteName || hostOf(a.url);
  const toggleAuto = () => {
    const next = !auto;
    void setAuto(next);
    setUndo(!next);
  };

  return (
    <div
      className="np-surface np-reader-surface"
      ref={surface}
      onScroll={onScroll}
      style={{ '--np-reader-fs': `${READER_SIZES[safeStep]}px` } as CSSProperties}
    >
      <div className="np-reader-actions" ref={bar}>
        <span className="np-reader-progress" aria-hidden="true" />
        <Button variant="quiet" className="np-reader-orig np-press-spring" aria-label={t('shell.reader.original')} onClick={() => commands.tabSetView(tab.id, 'original')}>
          <IconBack />
          <span>{t('shell.reader.original')}</span>
        </Button>
        <div className="np-reader-tools" role="group" aria-label={t('shell.reader.tools')}>
          <button
            type="button"
            className="np-reader-tool np-hit np-press-spring"
            aria-label={t('shell.reader.smaller')}
            title={t('shell.reader.smaller')}
            disabled={safeStep === 0}
            onClick={() => void setStep(safeStep - 1)}
          >
            <span aria-hidden="true" style={{ fontSize: 13 }}>A</span>
          </button>
          <button
            type="button"
            className="np-reader-tool np-hit np-press-spring"
            aria-label={t('shell.reader.larger')}
            title={t('shell.reader.larger')}
            disabled={safeStep === READER_SIZES.length - 1}
            onClick={() => void setStep(safeStep + 1)}
          >
            <span aria-hidden="true" style={{ fontSize: 19 }}>A</span>
          </button>
          <span className="np-reader-sep" aria-hidden="true" />
          <button
            type="button"
            className="np-reader-tool np-reader-auto np-hit np-press-spring"
            aria-pressed={!auto}
            onClick={toggleAuto}
            title={auto ? t('shell.reader.autoOffHint') : t('shell.reader.autoOnHint')}
          >
            {auto ? t('shell.reader.autoOff') : t('shell.reader.autoOn')}
          </button>
        </div>
      </div>
      <p className="np-reader-toast" role="status" data-show={undo ? 'true' : 'false'}>
        {undo ? (
          <>
            <span>{t('shell.reader.autoOffDone')}</span>
            <button type="button" className="np-reader-undo" onClick={() => { void setAuto(true); setUndo(false); }}>
              {t('shell.reader.undo')}
            </button>
          </>
        ) : null}
      </p>
      <ReaderView
        article={a}
        rewriteImage={rewrite}
        notice={
          a.limited ? (
            <aside className="np-reader-notice" role="note">
              <IconLimited />
              <div>
                <strong>{t('shell.reader.limitedTitle')}</strong>
                <p>{t('shell.reader.limitedBody')}</p>
                <button type="button" className="np-reader-link" onClick={() => commands.tabSetView(tab.id, 'original')}>
                  {t('shell.reader.original')}
                </button>
              </div>
            </aside>
          ) : null
        }
        onOpenLink={(url) => navigate(url)}
        kicker={
          <>
            <span className="np-reader-mark" aria-hidden="true">{site.trim().charAt(0).toUpperCase()}</span>
            <span>{site}</span>
          </>
        }
        deck={a.excerpt}
        meta={
          <>
            {byline ? <span>{t('shell.reader.byline', { name: byline })}</span> : null}
            {published ? <time dateTime={a.published ?? undefined}>{published}</time> : null}
            {words > 0 ? <span>{t('shell.reader.minutes', { n: minutes })}</span> : null}
          </>
        }
        empty={
          <div className="np-reader-empty">
            <h2>{t('shell.reader.emptyTitle')}</h2>
            <p>{t('shell.reader.emptyHint')}</p>
            <Button onClick={() => commands.tabSetView(tab.id, 'original')}>{t('shell.reader.original')}</Button>
          </div>
        }
      >
        <footer className="np-reader-foot">
          <span>{t('shell.reader.source', { host: hostOf(a.url) })}</span>
          <button type="button" className="np-reader-link" onClick={() => commands.tabSetView(tab.id, 'original')}>
            {t('shell.reader.original')}
          </button>
        </footer>
      </ReaderView>
    </div>
  );
}
