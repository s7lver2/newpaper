import { useI18n } from '@newpaper/i18n/react';
import { useEffect, useRef, useState, type FormEvent, type CSSProperties } from 'react';
import { ipc, type EventCard } from '../ipc';
import { go } from '../router';
import { usePullRefresh } from '../usePullRefresh';
import { IconRefresh, IconSearch } from '../icons';

const greeting = (h: number) => (h < 6 ? 'night' : h < 13 ? 'morning' : h < 21 ? 'afternoon' : 'evening');

/** Hoy: saludo, buscador (o pegar un enlace), briefing de temas con la mezcla de medios. Primera carga con esqueleto. */
export function Today() {
  const { t, formatDate } = useI18n();
  const [cards, setCards] = useState<EventCard[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => {
    setBusy(true);
    void ipc
      .eventsBriefing(10)
      .then(setCards)
      .catch(() => setCards([]))
      .finally(() => setBusy(false));
  };
  useEffect(load, []);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (/^https?:\/\//.test(v)) return go('leer', { u: v });
    if (v) setCards(await ipc.eventsSearch(v).catch(() => []));
  };
  const open = async (id: number) => {
    const d = await ipc.eventDetail(id).catch(() => null);
    const a = d?.articles.find((x) => x.bucket === 'center') ?? d?.articles[0];
    if (a) go('leer', { u: a.url });
  };
  const now = new Date();
  const root = useRef<HTMLDivElement>(null);
  const pull = usePullRefresh(root, async () => {
    load();
    await new Promise((r) => setTimeout(r, 600));
  });
  return (
    <div ref={root}>
      <div className="m-pull" aria-hidden="true" style={{ height: pull.offset, opacity: Math.min(1, pull.offset / 56) }}>
        <span className={`m-pull-dot${pull.state === 'refreshing' ? ' spin' : ''}`} style={{ transform: `rotate(${pull.offset * 4}deg) scale(${pull.state === 'armed' ? 1.15 : 1})` }}>
          <IconRefresh />
        </span>
        <small>{pull.state === 'armed' ? t('mobile.today.pull') : pull.state === 'pulling' ? t('mobile.today.pullHint') : ''}</small>
      </div>
      <header className="m-appbar" style={{ justifyContent: 'space-between' }}>
        <p className="m-kicker" style={{ margin: '0 0 0 12px' }}>{formatDate(now, { dateStyle: 'full' })}</p>
        <button type="button" className="m-back" aria-label={t('mobile.today.refresh')} onClick={load} disabled={busy}>
          <IconRefresh />
        </button>
      </header>
      <h1 className="m-large" style={{ paddingTop: 4 }}>{t(`newtab.greeting.${greeting(now.getHours())}`)}</h1>
      {cards && cards.length > 0 ? <p className="m-sub">{t('newtab.important', { n: cards.length })}</p> : null}
      <form role="search" onSubmit={(e) => void submit(e)} className="m-search">
        <IconSearch />
        <label className="m-sr" htmlFor="m-q">{t('mobile.today.search')}</label>
        <input id="m-q" type="search" placeholder={t('mobile.today.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <h2 className="m-sec">{t('newtab.briefing')}</h2>
      {cards === null ? (
        <div aria-busy="true" aria-label={t('mobile.today.loading')} style={{ padding: '0 20px', display: 'grid', gap: 18 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ display: 'grid', gap: 10 }}>
              <span className="m-skel" style={{ height: 22, width: `${92 - i * 6}%` }} />
              <span className="m-skel" style={{ height: 16, width: '60%' }} />
              <span className="m-skel" style={{ height: 4, width: '100%', borderRadius: 2 }} />
            </div>
          ))}
        </div>
      ) : cards.length === 0 ? (
        <p className="m-empty"><b>{t('mobile.today.emptyTitle')}</b>{t('mobile.today.empty')}</p>
      ) : (
        <div className="m-stagger" style={{ padding: '0 var(--m-gutter)', display: 'grid', gap: 12 }}>
          {cards.map((c, i) => {
            const total = Math.max(1, c.outletCount);
            const style = { '--i': i } as CSSProperties;
            return (
              <button key={c.eventId} type="button" className={`m-tap ${i === 0 ? 'm-feature' : 'm-item'}`} style={{ ...style, display: 'grid', gap: 8, textAlign: 'left', padding: i === 0 ? '18px 0 14px' : '14px 0', borderTop: i === 0 ? 'none' : '1px solid var(--np-line2)' }} onClick={() => void open(c.eventId)}>
                {i === 0 ? <span className="m-kicker" style={{ color: 'var(--np-accent)' }}>{t('mobile.today.featured')}</span> : null}
                <span style={{ font: `500 ${i === 0 ? 25 : 19}px/1.2 var(--np-font-read)` }}>{c.title}</span>
                <span className="np-mono np-muted">{t('newtab.outlets', { n: c.outletCount })}</span>
                <span className="np-leanmix" role="img" aria-label={t('newtab.leanMix', { left: c.leanMix[0], center: c.leanMix[1], right: c.leanMix[2] })}>
                  <span className="np-leanmix-l" style={{ width: `${(c.leanMix[0] / total) * 100}%` }} />
                  <span className="np-leanmix-c" style={{ width: `${(c.leanMix[1] / total) * 100}%` }} />
                  <span className="np-leanmix-r" style={{ width: `${(c.leanMix[2] / total) * 100}%` }} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
