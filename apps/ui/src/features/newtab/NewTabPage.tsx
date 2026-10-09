import { useI18n } from '@newpaper/i18n/react';
import type { UnverifiedReport } from '@newpaper/pipeline';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useState, type FormEvent } from 'react';
import { commands } from '../../ipc/commands';
import type { EventCard, HistoryEntry, SavedArticle, Suggestion, TopicState } from '../../ipc/types';
import type { InternalPageProps } from '../../shell/registry';
import { navigate } from '../../shell/navigate';
import { getPipeline } from '../ai/pipeline';
import { ConsentDialog } from '../analysis/nocoverage/ConsentDialog';
import { UnverifiedCard } from '../analysis/nocoverage/UnverifiedCard';

const greetingKey = (h: number) => (h < 6 ? 'night' : h < 13 ? 'morning' : h < 21 ? 'afternoon' : 'evening');

function LeanMix({ mix, label }: { mix: [number, number, number]; label: string }) {
  const total = mix[0] + mix[1] + mix[2] || 1;
  return (
    <span className="np-leanmix" role="img" aria-label={label}>
      <span className="np-leanmix-l" style={{ width: `${(mix[0] / total) * 100}%` }} />
      <span className="np-leanmix-c" style={{ width: `${(mix[1] / total) * 100}%` }} />
      <span className="np-leanmix-r" style={{ width: `${(mix[2] / total) * 100}%` }} />
    </span>
  );
}

async function openEvent(id: number) {
  const d = await commands.eventDetail(id);
  const first = d?.articles.find((a) => a.bucket === 'center') ?? d?.articles[0];
  if (first) void navigate(first.url);
}

function Cards({ cards }: { cards: EventCard[] }) {
  const { t, formatRelativeDays } = useI18n();
  return (
    <ul className="np-cards">
      {cards.map((c) => (
        <li key={c.eventId}>
          <button type="button" className="np-card" onClick={() => void openEvent(c.eventId)}>
            <span className="np-card-title">{c.title}</span>
            <span className="np-card-meta">
              {t('newtab.outlets', { n: c.outletCount })} · {formatRelativeDays(Math.round((c.latestAt - Date.now()) / 86_400_000))}
            </span>
            <LeanMix mix={c.leanMix} label={t('newtab.leanMix', { left: c.leanMix[0], center: c.leanMix[1], right: c.leanMix[2] })} />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function NewTabPage({ url }: InternalPageProps) {
  const { t, formatDate } = useI18n();
  const q = url.query.get('q') ?? '';
  const [input, setInput] = useState(q);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [briefing, setBriefing] = useState<EventCard[]>([]);
  const [results, setResults] = useState<EventCard[] | null>(null);
  const [topics, setTopics] = useState<TopicState[]>([]);
  const [saved, setSaved] = useState<SavedArticle[]>([]);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
  const [asking, setAsking] = useState(false);
  const [report, setReport] = useState<UnverifiedReport | null>(null);
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    void commands.eventsBriefing(6).then(setBriefing).catch(() => {});
    void commands.topicsList().then(setTopics).catch(() => {});
    void commands.savedList().then((s) => setSaved(s.slice(0, 4))).catch(() => {});
    void commands.historySearch({ kind: 'visit', limit: 4 }).then(setRecent).catch(() => {});
  }, []);
  useEffect(() => {
    setResults(null);
    setReport(null);
    setWatching(false);
    if (q) void commands.eventsSearch(q).then(setResults).catch(() => setResults([]));
  }, [q]);
  useEffect(() => {
    if (!input.trim() || input === q) return setSuggestions([]);
    const h = setTimeout(() => void commands.omniboxSuggest(input).then((s) => setSuggestions(s.slice(0, 6))), 120);
    return () => clearTimeout(h);
  }, [input, q]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (input.trim()) void navigate(input.trim());
  };
  const investigate = async (acknowledged: true) => {
    setAsking(false);
    const p = await getPipeline();
    setReport(await p.investigateUncovered({ article: { url: `newpaper://inicio?q=${encodeURIComponent(q)}`, title: q, text: q }, previous: null, acknowledged }));
  };
  const now = new Date();

  return (
    <div className="np-newtab">
      <header>
        <p className="np-mono np-muted">{formatDate(now, { dateStyle: 'full' })}</p>
        <h1>{t(`newtab.greeting.${greetingKey(now.getHours())}`)}</h1>
      </header>
      <form className="np-newtab-search" role="search" onSubmit={submit}>
        <label className="np-sr-only" htmlFor="np-newtab-q">{t('newtab.search')}</label>
        <input id="np-newtab-q" type="search" autoComplete="off" placeholder={t('newtab.search')} value={input} onChange={(e) => setInput(e.target.value)} />
        {suggestions.length ? (
          <ul className="np-newtab-suggest" role="listbox" aria-label={t('shell.address.suggestions')}>
            {suggestions.map((s) => (
              <li key={`${s.kind}-${s.value}`} role="option" aria-selected={false}>
                <button type="button" onClick={() => void navigate(s.value)}>
                  <span className="np-tag np-tag--muted">{t(`shell.address.kind.${s.kind}`)}</span> {s.label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>

      {q ? (
        <section aria-label={t('newtab.results', { query: q })}>
          <h2>{t('newtab.results', { query: q })}</h2>
          {results === null ? <p className="np-muted" aria-busy="true">{t('newtab.searching')}</p> : null}
          {results?.length ? <Cards cards={results} /> : null}
          {results && results.length === 0 ? (
            <div className="np-nocov">
              <p>{t('newtab.noCoverage', { query: q })}</p>
              <div className="np-nocov-actions">
                <Button disabled={watching} onClick={() => void commands.watchAdd({ query: q }).then(() => setWatching(true))}>
                  {watching ? t('noCoverage.watching') : t('noCoverage.watch')}
                </Button>
                <Button variant="primary" onClick={() => setAsking(true)}>{t('noCoverage.investigate')}</Button>
              </div>
              {report ? <UnverifiedCard report={report} /> : null}
              <ConsentDialog open={asking} onConfirm={(ack) => void investigate(ack)} onCancel={() => setAsking(false)} />
            </div>
          ) : null}
        </section>
      ) : null}

      {briefing.length ? (
        <section>
          <h2>{t('newtab.briefing')}</h2>
          <Cards cards={briefing} />
        </section>
      ) : null}

      {topics.length ? (
        <section>
          <h2>{t('newtab.topics')}</h2>
          <div className="np-topics">
            {topics.map((tp) => (
              <button
                key={tp.id}
                type="button"
                className="np-topic"
                aria-pressed={tp.following}
                onClick={() => void commands.topicSetFollowing(tp.id, !tp.following).then(setTopics)}
              >
                {tp.name}
                {tp.newCount ? <span className="np-tab-badge">{tp.newCount}</span> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {saved.length || recent.length ? (
        <section>
          <h2>{t('newtab.continue')}</h2>
          <ul className="np-continue">
            {saved.map((s) => (
              <li key={s.url}>
                <button type="button" className="np-link" onClick={() => void navigate(s.url)}>{s.title}</button>
                <span className="np-tag np-tag--accent">{t('newtab.saved')}</span>
              </li>
            ))}
            {recent.map((r) => (
              <li key={r.id}>
                <button type="button" className="np-link" onClick={() => void navigate(r.url!)}>{r.title || r.url}</button>
                {r.outlet ? <span className="np-mono np-muted">{r.outlet}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
