import { useI18n } from '@newpaper/i18n/react';
import { Button, IconButton, SegmentedControl } from '@newpaper/ui-kit';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { HistoryEntry, HistoryFilter } from '../../ipc/types';
import { IconClose } from '../../shell/icons';
import { navigate } from '../../shell/navigate';
import { useSetting } from '../../state/settings';
import { groupByDay, rangeFor } from './groupByDay';

type Kind = 'all' | 'visit' | 'search' | 'analysis';

export function HistoryPage() {
  const { t, formatDate } = useI18n();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [outlet, setOutlet] = useState<string>('');
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [paused, setPaused] = useSetting<boolean>('history.paused', false);
  const [retention, setRetention] = useSetting<number | null>('history.retentionDays', 90);

  const load = useCallback(async () => {
    const f: HistoryFilter = { limit: 500 };
    if (text.trim()) f.text = text.trim();
    if (kind !== 'all') f.kind = kind;
    if (outlet) f.outlet = outlet;
    setItems(await commands.historySearch(f));
  }, [text, kind, outlet]);

  useEffect(() => {
    const h = setTimeout(() => void load(), 200);
    return () => clearTimeout(h);
  }, [load]);

  const outlets = useMemo(() => [...new Set(items.map((i) => i.outlet).filter((o): o is string => !!o))].sort(), [items]);
  const groups = useMemo(() => groupByDay(items, new Date()), [items]);
  const del = async (scope: Parameters<typeof commands.historyDelete>[0]) => {
    await commands.historyDelete(scope);
    await load();
  };
  const open = (e: HistoryEntry) => void navigate(e.kind === 'visit' ? e.url! : e.query!);

  return (
    <div className="np-history">
      <h1>{t('history.title')}</h1>
      {paused ? (
        <p className="np-hint" role="status">
          {t('history.paused')} <Button variant="quiet" onClick={() => void setPaused(false)}>{t('history.resume')}</Button>
        </p>
      ) : null}
      <label className="np-sr-only" htmlFor="np-history-q">{t('history.search')}</label>
      <input id="np-history-q" className="np-history-search" type="search" placeholder={t('history.search')} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="np-history-filters">
        <SegmentedControl label={t('history.kind.label')} value={kind} onChange={(v) => setKind(v as Kind)} options={(['all', 'visit', 'search', 'analysis'] as const).map((k) => ({ value: k, label: t(`history.kind.${k}`) }))} />
        <select aria-label={t('history.outlet')} value={outlet} onChange={(e) => setOutlet(e.target.value)}>
          <option value="">{t('history.allOutlets')}</option>
          {outlets.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </div>

      {groups.length === 0 ? <p className="np-panel-empty">{text ? t('history.noResults') : t('history.empty')}</p> : null}
      {groups.map((g) => (
        <section key={g.key} className="np-history-day">
          <h2>{g.kind === 'date' ? formatDate(g.date, { dateStyle: 'full' }) : t(`history.${g.kind}`)}</h2>
          <ul>
            {g.items.map((it) => (
              <li key={it.id} className="np-history-row">
                <span className="np-mono np-muted">{formatDate(new Date(it.at), { timeStyle: 'short' })}</span>
                <button type="button" className="np-link np-history-open" onClick={() => open(it)}>
                  {it.kind === 'search' ? t('history.searched', { query: it.query ?? '' }) : it.title || it.url}
                </button>
                {it.outlet ? <span className="np-mono np-muted">{it.outlet}</span> : <span />}
                {it.analyzed ? <span className="np-tag np-tag--accent">{t('history.analyzed')}</span> : <span />}
                <IconButton label={t('history.deleteOne')} icon={<IconClose />} onClick={() => void del({ scope: 'one', id: it.id })} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="np-history-settings">
        <h2>{t('history.manage')}</h2>
        <div className="np-history-actions">
          {(['hour', 'today', 'week'] as const).map((r) => (
            <Button key={r} onClick={() => void del({ scope: 'range', ...rangeFor(r, new Date()) })}>{t(`history.delete.${r}`)}</Button>
          ))}
          {outlet ? <Button onClick={() => void del({ scope: 'outlet', outlet })}>{t('history.delete.outlet', { outlet })}</Button> : null}
          <Button variant="danger" onClick={() => void del({ scope: 'all' })}>{t('history.delete.all')}</Button>
        </div>
        <label className="np-field">
          <span>{t('history.retention')}</span>
          <select value={retention === null ? 'forever' : String(retention)} onChange={(e) => void setRetention(e.target.value === 'forever' ? null : Number(e.target.value))}>
            {[7, 30, 90, 365].map((d) => (
              <option key={d} value={d}>{t('history.days', { n: d })}</option>
            ))}
            <option value="forever">{t('history.forever')}</option>
          </select>
        </label>
        <Button variant="quiet" onClick={() => void setPaused(!paused)}>{paused ? t('history.resume') : t('history.pause')}</Button>
        <p className="np-muted">{t('history.privateNote')}</p>
      </section>
    </div>
  );
}
