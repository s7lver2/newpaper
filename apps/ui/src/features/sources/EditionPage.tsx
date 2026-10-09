import type { Article } from '@newpaper/extract';
import { useI18n } from '@newpaper/i18n/react';
import { Button, ReaderView } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { Edition, EventCard, OfflineArticle, OfflineHit, SavedArticle } from '../../ipc/types';
import type { InternalPageProps } from '../../shell/registry';
import { rewriteImage } from '../../shell/ReaderSurface';

export function EditionPage({ url }: InternalPageProps) {
  const { t, formatDate } = useI18n();
  const [edition, setEdition] = useState<Edition | null>(null);
  const [articles, setArticles] = useState<OfflineArticle[]>([]);
  const [saved, setSaved] = useState<SavedArticle[]>([]);
  const [open, setOpen] = useState<{ article: Article; analysis: string | null } | null>(null);
  const [hits, setHits] = useState<OfflineHit[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    void (async () => {
      const eds = await commands.offlineEditions();
      const ed = eds.find((e) => e.id === url.path[0]) ?? eds.find((e) => e.status === 'ready') ?? null;
      setEdition(ed);
      if (ed) setArticles(await commands.offlineEdition(ed.id));
      setSaved(await commands.savedList());
    })();
  }, [url.path]);

  if (open) {
    return (
      <div className="np-edition">
        <Button variant="quiet" onClick={() => setOpen(null)}>{t('common.close')}</Button>
        {open.analysis ? <p className="np-kicker">{t('sources.offline.cached')}</p> : null}
        <ReaderView article={open.article} rewriteImage={rewriteImage} />
      </div>
    );
  }
  const essentials: EventCard[] = edition ? (JSON.parse(edition.summaryJson || '[]') as EventCard[]).slice(0, 3) : [];
  const openArticle = (a: { articleJson: string; analysisJson?: string | null }) => setOpen({ article: JSON.parse(a.articleJson) as Article, analysis: a.analysisJson ?? null });

  return (
    <div className="np-edition">
      <h1 className="np-inicio-title">{t('sources.offline.editionTitle')}</h1>
      {edition ? (
        <p className="np-mono np-settings-hint">
          {t('sources.offline.editionMeta', { date: formatDate(new Date(edition.date), { dateStyle: 'full' }), count: edition.articleCount, mb: Math.round(edition.bytes / 1048576) })}
        </p>
      ) : (
        <p>{t('sources.offline.empty')}</p>
      )}
      {essentials.length ? (
        <section>
          <h2 className="np-kicker">{t('sources.offline.essential')}</h2>
          <ul>{essentials.map((e) => <li key={e.eventId}>{e.title}</li>)}</ul>
        </section>
      ) : null}
      <ul className="np-edition-list">
        {articles.map((a) => {
          const n = a.analysisJson ? (JSON.parse(a.analysisJson) as { neutrality?: number }).neutrality : undefined;
          return (
            <li key={a.url}>
              <button type="button" className="np-edition-item" onClick={() => openArticle(a)}>
                <span>{a.title}</span>
                {a.outlet ? <span className="np-mono np-settings-hint">{a.outlet}</span> : null}
                {n !== undefined ? <span className="np-mono">{n}</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <section>
        <h2 className="np-kicker">{t('sources.offline.savedTitle')}</h2>
        <ul className="np-edition-list">
          {saved.map((s) => (
            <li key={s.url}><button type="button" className="np-edition-item" onClick={() => openArticle(s)}>{s.title}</button></li>
          ))}
        </ul>
      </section>
      <form role="search" onSubmit={async (e) => { e.preventDefault(); setHits(await commands.offlineSearch(query)); }}>
        <input type="search" aria-label={t('sources.offline.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <p className="np-settings-hint">{t('sources.offline.searchHint')}</p>
      </form>
      {hits ? <ul>{hits.map((h) => <li key={h.reference}>{h.title}</li>)}</ul> : null}
    </div>
  );
}
