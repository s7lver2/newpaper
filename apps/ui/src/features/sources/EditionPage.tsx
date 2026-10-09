import type { Article } from '@newpaper/extract';
import { useI18n } from '@newpaper/i18n/react';
import { ReaderView } from '@newpaper/ui-kit';
import { useEffect, useMemo, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { Edition, EventCard, OfflineArticle, OfflineHit, SavedArticle } from '../../ipc/types';
import { openInternal } from '../../shell/navigate';
import type { InternalPageProps } from '../../shell/registry';
import { rewriteImage } from '../../shell/ReaderSurface';

const MB = 1048576;
const WORDS_PER_MINUTE = 220;

const BackIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
);
const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
);
const DbIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></svg>
);

interface Opened { article: Article; analysis: { neutrality?: number } | null; outlet: string | null }

const parseArticle = (json: string): Article | null => {
  try {
    return JSON.parse(json) as Article;
  } catch {
    return null;
  }
};
const parseAnalysis = (json: string | null | undefined): { neutrality?: number } | null => {
  if (!json) return null;
  try {
    return JSON.parse(json) as { neutrality?: number };
  } catch {
    return null;
  }
};
/** El mismo artículo puede estar en varias ediciones (o también guardado): se muestra una sola vez. */
const uniqueHits = (hits: OfflineHit[]): OfflineHit[] => {
  const seen = new Set<string>();
  return hits.filter((h) => {
    const key = h.kind === 'saved' ? h.reference : h.reference.slice(h.reference.indexOf(' ') + 1);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const minutesOf = (a: Article) => Math.max(1, Math.round((a.text.trim() ? a.text.trim().split(/\s+/).length : 0) / WORDS_PER_MINUTE));

export function EditionPage({ url }: InternalPageProps) {
  const { t, formatDate, formatNumber } = useI18n();
  const [edition, setEdition] = useState<Edition | null>(null);
  const [articles, setArticles] = useState<OfflineArticle[]>([]);
  const [saved, setSaved] = useState<SavedArticle[]>([]);
  const [open, setOpen] = useState<Opened | null>(null);
  const [flip, setFlip] = useState(false);
  const [hits, setHits] = useState<OfflineHit[] | null>(null);
  const [query, setQuery] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [topicsFollowed, setTopicsFollowed] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const eds = await commands.offlineEditions();
      const ed = eds.find((e) => e.id === url.path[0]) ?? eds.find((e) => e.status === 'ready') ?? null;
      setEdition(ed);
      if (ed) setArticles(await commands.offlineEdition(ed.id));
      setSaved(await commands.savedList());
      setTopicsFollowed((await commands.topicsList()).filter((x) => x.following).length);
      setLoaded(true);
    })();
  }, [url.path]);

  const parsed = useMemo(
    () => articles.flatMap((a) => {
      const article = parseArticle(a.articleJson);
      return article ? [{ row: a, article, analysis: parseAnalysis(a.analysisJson) }] : [];
    }),
    [articles],
  );
  const essentials = useMemo(() => {
    try {
      return (JSON.parse(edition?.summaryJson || '[]') as EventCard[]).slice(0, 3);
    } catch {
      return [];
    }
  }, [edition]);

  const show = (o: Opened | null) => {
    setOpen(o);
    setFlip((f) => !f);
  };
  const openHit = (h: OfflineHit) => {
    if (h.kind === 'saved') {
      const s = saved.find((x) => x.url === h.reference);
      const article = s && parseArticle(s.articleJson);
      if (s && article) show({ article, analysis: null, outlet: s.outlet });
      return;
    }
    const target = h.reference.slice(h.reference.indexOf(' ') + 1);
    const hit = parsed.find((p) => p.row.url === target);
    if (hit) show({ article: hit.article, analysis: hit.analysis, outlet: hit.row.outlet });
    else void commands.offlineEditions().then(async (eds) => {
      const id = h.reference.slice(0, h.reference.indexOf(' '));
      if (!eds.some((e) => e.id === id)) return;
      const row = (await commands.offlineEdition(id)).find((r) => r.url === target);
      const article = row && parseArticle(row.articleJson);
      if (row && article) show({ article, analysis: parseAnalysis(row.analysisJson), outlet: row.outlet });
    });
  };

  const meta = edition
    ? t('sources.offline.editionMeta', {
        date: formatDate(new Date(`${edition.date}T12:00:00`), { dateStyle: 'full' }),
        time: formatDate(new Date(edition.createdAt * 1000), { timeStyle: 'short' }),
        mb: formatNumber(edition.bytes / MB, { maximumFractionDigits: 1 }),
      })
    : t('sources.offline.noEdition');

  return (
    <div className="np-ed">
      <main className="np-ed-main">
        <div className="np-ed-col">
          <header className="np-ed-head">
            <div className="np-ed-meta">
              <span className="np-ed-meta-text">{meta}</span>
              <span className="np-ed-net" data-online={online} role="status"><span className="np-ed-net-dot" />{t(online ? 'sources.offline.online' : 'sources.offline.offline')}</span>
            </div>
            <div className="np-ed-title-row">
              <h1 className="np-ed-title">{t('sources.offline.editionTitle')}</h1>
              {edition ? <div className="np-ed-count">{t('sources.offline.count', { count: edition.articleCount, topics: topicsFollowed })}</div> : null}
            </div>
          </header>

          {open ? (
            <article className="np-ed-view" data-flip={flip}>
              <button type="button" className="np-ed-back" onClick={() => show(null)}><BackIcon />{t('sources.offline.front')}</button>
              <div className="np-reader-surface np-ed-reader">
                <ReaderView
                  article={open.article}
                  kicker={open.outlet ?? open.article.siteName}
                  rewriteImage={(abs) => rewriteImage(abs)}
                  notice={open.analysis ? (
                    <div className="np-ed-cached">
                      <DbIcon />
                      <span className="np-ed-cached-text"><strong style={{ fontWeight: 500 }}>{t('sources.offline.cached')}</strong> · {t('sources.offline.cachedNote')}</span>
                      {open.analysis.neutrality !== undefined ? <span className="np-ed-score">{t('sources.offline.neutrality', { n: open.analysis.neutrality })}</span> : null}
                    </div>
                  ) : null}
                />
              </div>
            </article>
          ) : (
            <div className="np-ed-view" data-flip={flip}>
              {essentials.length ? (
                <section className="np-ed-essential">
                  <h2 className="np-kicker">{t('sources.offline.essential')}</h2>
                  <ol>{essentials.map((e) => <li key={e.eventId}>{e.title}</li>)}</ol>
                </section>
              ) : null}
              {loaded && !parsed.length ? <p className="np-ed-empty">{t('sources.offline.empty')}</p> : null}
              <div className="np-ed-grid np-stagger">
                {parsed.map(({ row, article, analysis }) => (
                  <button key={row.url} type="button" className="np-ed-card" onClick={() => show({ article, analysis, outlet: row.outlet })}>
                    <span className="np-ed-card-top">
                      <span className="np-kicker">{row.outlet ?? article.siteName ?? ''}</span>
                      {analysis ? <span className="np-ed-chip"><CheckIcon />{t('sources.offline.analyzed')}</span> : null}
                    </span>
                    <span className="np-ed-card-head">{row.title}</span>
                    {article.excerpt ? <span className="np-ed-card-dek">{article.excerpt}</span> : null}
                    <span className="np-ed-card-foot">
                      <span>{t('sources.offline.minutes', { n: minutesOf(article) })}</span>
                      {analysis?.neutrality !== undefined ? <span>{t('sources.offline.neutrality', { n: analysis.neutrality })}</span> : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <aside className="np-ed-side" aria-label={t('sources.offline.savedTitle')}>
        <div className="np-ed-side-head">
          <h2 className="np-ed-side-title">{t('sources.offline.savedTitle')} · {saved.length}</h2>
          <button type="button" className="np-ed-link" onClick={() => openInternal('ajustes', ['sin-conexion'])}>{t('sources.offline.settingsLink')}</button>
        </div>
        <div className="np-ed-side-body">
          <form
            role="search"
            className="np-ed-search"
            onSubmit={async (e) => {
              e.preventDefault();
              setHits(query.trim() ? uniqueHits(await commands.offlineSearch(query.trim())) : null);
            }}
          >
            <input type="search" aria-label={t('sources.offline.search')} placeholder={t('sources.offline.search')} value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value) setHits(null); }} />
          </form>
          {hits ? (
            hits.length ? (
              hits.map((h) => (
                <button key={`${h.kind}:${h.reference}`} type="button" className="np-ed-saved" onClick={() => openHit(h)}>
                  <span className="np-ed-saved-src">{t(h.kind === 'saved' ? 'sources.offline.hitSaved' : 'sources.offline.hitEdition')}</span>
                  <span className="np-ed-saved-head">{h.title}</span>
                </button>
              ))
            ) : (
              <p className="np-ed-hint">{t('sources.offline.noHits')}</p>
            )
          ) : saved.length ? (
            saved.map((s) => {
              const article = parseArticle(s.articleJson);
              return (
                <button key={s.url} type="button" className="np-ed-saved" disabled={!article} onClick={() => article && show({ article, analysis: null, outlet: s.outlet })}>
                  <span className="np-ed-saved-src">{s.outlet ?? ''}</span>
                  <span className="np-ed-saved-head">{s.title}</span>
                  <span className="np-ed-saved-meta">
                    <span>{formatDate(new Date(s.savedAt * 1000), { dateStyle: 'medium' })}</span>
                    <span>{s.articleJson.length < MB ? t('sources.offline.kb', { kb: formatNumber(Math.max(1, Math.round(s.articleJson.length / 1024))) }) : t('sources.offline.mb', { mb: formatNumber(s.articleJson.length / MB, { maximumFractionDigits: 1 }) })}</span>
                    <b>{t('sources.offline.available')}</b>
                  </span>
                </button>
              );
            })
          ) : (
            <p className="np-ed-hint">{t('sources.offline.savedEmpty')}</p>
          )}
          <p className="np-ed-hint">{t('sources.offline.searchHint')}</p>
        </div>
      </aside>
    </div>
  );
}
