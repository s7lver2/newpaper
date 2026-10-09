import { useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { useI18n } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { convertFileSrc } from '@tauri-apps/api/core';
import { commands } from '../ipc/commands';
import type { ListingItem } from '@newpaper/extract';
import { navigate } from './navigate';
import { IconBack, IconSearch } from './icons';
import type { ReaderSurfaceProps } from './registry';

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Agrupa por sección conservando el orden de aparición; los titulares sin sección van al final. */
export function groupBySection(items: ListingItem[]): { section: string | null; items: ListingItem[] }[] {
  const groups: { section: string | null; items: ListingItem[] }[] = [];
  const byName = new Map<string, { section: string | null; items: ListingItem[] }>();
  for (const it of items) {
    const key = it.section ?? '';
    let g = byName.get(key);
    if (!g) {
      g = { section: it.section ?? null, items: [] };
      byName.set(key, g);
      groups.push(g);
    }
    g.items.push(it);
  }
  const loose = groups.findIndex((g) => g.section === null);
  if (loose > -1 && loose < groups.length - 1) groups.push(groups.splice(loose, 1)[0]!);
  return groups;
}

export const filterItems = (items: ListingItem[], q: string): ListingItem[] => {
  const needle = norm(q.trim());
  if (!needle) return items;
  return items.filter((i) => norm(`${i.title} ${i.summary ?? ''} ${i.section ?? ''}`).includes(needle));
};

/** Selector de artículos: lista editorial de los titulares de una portada, sección o búsqueda. */
export function ListingReader({ tab, page }: ReaderSurfaceProps) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const surface = useRef<HTMLDivElement>(null);
  const items = page.items ?? [];
  const shown = useMemo(() => filterItems(items, q), [items, q]);
  const groups = useMemo(() => groupBySection(shown), [shown]);
  const site = page.siteName || hostOf(page.url);
  const image = (src: string) => `${convertFileSrc(src, 'npimg')}?r=${encodeURIComponent(page.url)}`;

  const open = (e: MouseEvent, url: string) => {
    e.preventDefault();
    void navigate(url, { newTab: e.ctrlKey || e.metaKey || e.button === 1 });
  };
  let stagger = 0;

  return (
    <div className="np-surface np-reader-surface np-listing-surface" ref={surface}>
      <div className="np-reader-actions">
        <Button variant="quiet" className="np-reader-orig np-press-spring" aria-label={t('shell.reader.original')} onClick={() => commands.tabSetView(tab.id, 'original')}>
          <IconBack />
          <span>{t('shell.reader.original')}</span>
        </Button>
      </div>
      <section className="np-listing np-rise" aria-labelledby="np-listing-title">
        <header className="np-listing-head">
          <div className="np-reader-kicker">
            <span className="np-reader-mark" aria-hidden="true">{site.trim().charAt(0).toUpperCase()}</span>
            <span>{t('shell.listing.title')}</span>
          </div>
          <h1 id="np-listing-title" className="np-reader-title">{page.title || site}</h1>
          <p className="np-reader-deck">{t('shell.listing.lead', { site })}</p>
          <label className="np-listing-filter">
            <IconSearch />
            <span className="np-sr-only">{t('shell.listing.filter')}</span>
            <input type="search" value={q} placeholder={t('shell.listing.filterPlaceholder')} onChange={(e) => setQ(e.target.value)} />
            <span className="np-listing-count" aria-live="polite">{t('shell.listing.count', { count: shown.length })}</span>
          </label>
        </header>
        {groups.length === 0 ? <p className="np-listing-empty" role="status">{t('shell.listing.noMatches')}</p> : null}
        {groups.map((g) => (
          <div className="np-listing-group" key={g.section ?? '_'}>
            <h2 className="np-listing-section">{g.section ?? t('shell.listing.otherSection')}</h2>
            <ul className="np-listing-list">
              {g.items.map((it) => (
                <li key={it.url} className="np-listing-item" style={{ '--np-i': Math.min(stagger++, 14) } as CSSProperties}>
                  <a
                    href={it.url}
                    className="np-listing-link np-hit"
                    onClick={(e) => open(e, it.url)}
                    onAuxClick={(e) => e.button === 1 && open(e, it.url)}
                    title={t('shell.listing.openHint')}
                  >
                    <span className="np-listing-text">
                      <span className="np-listing-title">{it.title}</span>
                      {it.summary ? <span className="np-listing-summary">{it.summary}</span> : null}
                    </span>
                    {it.image ? <img className="np-listing-thumb" src={image(it.image)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} /> : null}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <footer className="np-reader-foot">
          <span>{t('shell.reader.source', { host: hostOf(page.url) })}</span>
          <button type="button" className="np-reader-link" onClick={() => commands.tabSetView(tab.id, 'original')}>
            {t('shell.reader.original')}
          </button>
        </footer>
      </section>
    </div>
  );
}
