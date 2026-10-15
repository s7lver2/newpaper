import { useI18n } from '@newpaper/i18n/react';
import { useEffect, useState, type FormEvent } from 'react';
import { ipc, type EventCard } from '../ipc';
import { go } from '../router';

const greeting = (h: number) => (h < 6 ? 'night' : h < 13 ? 'morning' : h < 21 ? 'afternoon' : 'evening');

/** Hoy: saludo, buscador (o pegar un enlace) y el briefing de temas con la mezcla de medios. */
export function Today() {
  const { t, formatDate } = useI18n();
  const [cards, setCards] = useState<EventCard[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    void ipc.eventsBriefing(10).then(setCards).catch(() => {});
  }, []);
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
  return (
    <section>
      <p className="np-mono np-muted">{formatDate(now, { dateStyle: 'full' })}</p>
      <h1 className="m-title">{t(`newtab.greeting.${greeting(now.getHours())}`)}</h1>
      <form role="search" onSubmit={(e) => void submit(e)}>
        <label className="np-sr-only" htmlFor="m-q">{t('mobile.today.search')}</label>
        <input id="m-q" className="m-input" type="search" placeholder={t('mobile.today.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <h2 className="np-mono np-muted">{t('newtab.briefing')}</h2>
      {cards.length === 0 ? <p className="np-muted">{t('mobile.today.empty')}</p> : null}
      {cards.map((c) => {
        const total = Math.max(1, c.outletCount);
        return (
          <button key={c.eventId} type="button" className="m-card" onClick={() => void open(c.eventId)}>
            <strong>{c.title}</strong>
            <span className="np-mono np-muted">{t('newtab.outlets', { n: c.outletCount })}</span>
            <span className="np-leanmix" role="img" aria-label={t('newtab.leanMix', { left: c.leanMix[0], center: c.leanMix[1], right: c.leanMix[2] })}>
              <span className="np-leanmix-l" style={{ width: `${(c.leanMix[0] / total) * 100}%` }} />
              <span className="np-leanmix-c" style={{ width: `${(c.leanMix[1] / total) * 100}%` }} />
              <span className="np-leanmix-r" style={{ width: `${(c.leanMix[2] / total) * 100}%` }} />
            </span>
          </button>
        );
      })}
    </section>
  );
}
