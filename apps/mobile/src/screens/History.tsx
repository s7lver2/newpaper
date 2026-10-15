import { Bar } from './Bar';
import { useI18n } from '@newpaper/i18n/react';
import { groupByDay } from '@newpaper/ui-kit/logic';
import { useEffect, useMemo, useState } from 'react';
import { ipc, type HistoryEntry } from '../ipc';
import { go } from '../router';

/** Historial agrupado por dia. Tocar una visita la abre en "Leyendo". */
export function History() {
  const { t, formatDate } = useI18n();
  const [text, setText] = useState('');
  const [items, setItems] = useState<HistoryEntry[]>([]);
  useEffect(() => {
    const h = setTimeout(() => void ipc.historySearch({ text: text || undefined, limit: 300 }).then(setItems).catch(() => {}), 200);
    return () => clearTimeout(h);
  }, [text]);
  const groups = useMemo(() => groupByDay(items, new Date()), [items]);
  return (
    <section className="m-body">
      <Bar title={t('history.title')} />
      <input className="m-input" type="search" aria-label={t('history.search')} placeholder={t('history.search')} value={text} onChange={(e) => setText(e.target.value)} />
      {groups.length === 0 ? <p className="np-muted">{t('history.empty')}</p> : null}
      {groups.map((g) => (
        <div key={g.key}>
          <h2 className="np-mono np-muted">{g.kind === 'date' ? formatDate(g.date, { dateStyle: 'full' }) : t(`history.${g.kind}`)}</h2>
          {g.items.map((it) => (
            <button key={it.id} type="button" className="m-card" onClick={() => (it.url ? go('leer', { u: it.url }) : undefined)}>
              <span>{it.kind === 'search' ? t('history.searched', { query: it.query ?? '' }) : it.title || it.url}</span>
              <span className="np-mono np-muted">
                {formatDate(new Date(it.at), { timeStyle: 'short' })}
                {it.analyzed ? ` · ${t('history.analyzed')}` : ''}
              </span>
            </button>
          ))}
        </div>
      ))}
    </section>
  );
}
