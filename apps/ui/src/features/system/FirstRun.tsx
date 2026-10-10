import { extractFromHtml } from '@newpaper/extract';
import { useI18n } from '@newpaper/i18n/react';
import { Button, Switch } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import { onOllamaProgress } from '../../ipc/events';
import type { FirstRunStatus } from '../../ipc/types';
import { navigate } from '../../shell/navigate';
import { startTour } from './tour/Tour';

const MODEL = 'qwen3:8b';
/** Máximo de marcadores que se importan de una vez (los demás se pueden importar después). */
const IMPORT_LIMIT = 50;

export function FirstRun() {
  const { t, formatNumber } = useI18n();
  const [st, setSt] = useState<FirstRunStatus | null>(null);
  const [autostart, setAutostart] = useState(false);
  const [tor, setTor] = useState(false);
  const [browser, setBrowser] = useState<string>('');
  const [imported, setImported] = useState<{ done: number; total: number; ignored: number } | null>(null);
  const [pull, setPull] = useState<{ status: string; pct: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void commands.firstRunStatus().then((s) => {
      setSt(s);
      setAutostart(s.autostart);
      setBrowser(s.browsers[0] ?? '');
    });
  }, []);
  if (!st || st.done) return null;

  const importBookmarks = async () => {
    const scan = await commands.bookmarksScan(browser);
    const list = scan.bookmarks.slice(0, IMPORT_LIMIT);
    setImported({ done: 0, total: list.length, ignored: scan.ignored });
    let done = 0;
    for (const b of list) {
      try {
        const html = await commands.offlineFetchHtml(b.url);
        const a = extractFromHtml(html, b.url);
        if (a) await commands.savedAdd({ url: b.url, title: a.title || b.title, outlet: a.siteName, articleJson: JSON.stringify(a), savedAt: Math.floor(Date.now() / 1000) });
      } catch {
        /* marcador inaccesible: se omite */
      }
      done += 1;
      setImported({ done, total: list.length, ignored: scan.ignored });
    }
  };
  const pullModel = async () => {
    const un = await onOllamaProgress((p) => setPull({ status: p.status, pct: p.total ? Math.round(((p.completed ?? 0) / p.total) * 100) : 0 }));
    try {
      await commands.ollamaPull(MODEL);
      setPull({ status: 'success', pct: 100 });
    } finally {
      un();
    }
  };
  const finish = async () => {
    setBusy(true);
    await commands.firstRunApply({ autostart, tor });
    setSt({ ...st, done: true });
    startTour();
  };

  return (
    <div className="np-consent-backdrop">
      <div className="np-firstrun np-rise" role="dialog" aria-modal="true" aria-labelledby="np-firstrun-t">
        <h2 id="np-firstrun-t">{t('firstRun.title')}</h2>
        <p className="np-muted">{t('firstRun.subtitle')}</p>
        <Switch checked={autostart} onChange={setAutostart} label={t('firstRun.autostart')} description={t('firstRun.autostartHint')} />
        <Switch checked={tor} onChange={setTor} label={t('firstRun.tor')} description={t('firstRun.torHint')} />
        <div className="np-firstrun-row">
          <div>
            <strong>{t('firstRun.links')}</strong>
            <p className="np-muted">{t('firstRun.linksHint')}</p>
          </div>
          <Button onClick={() => void commands.openDefaultApps()}>{t('firstRun.linksOpen')}</Button>
        </div>
        {st.browsers.length ? (
          <div className="np-firstrun-row">
            <div>
              <strong>{t('firstRun.bookmarks')}</strong>
              <p className="np-muted">{t('firstRun.bookmarksHint')}</p>
              <select aria-label={t('firstRun.browser')} value={browser} onChange={(e) => setBrowser(e.target.value)}>
                {st.browsers.map((b) => (
                  <option key={b} value={b}>{t(`firstRun.browsers.${b}`)}</option>
                ))}
              </select>
              {imported ? (
                <p role="status">
                  {t('firstRun.imported', { done: formatNumber(imported.done), total: formatNumber(imported.total) })}
                  {imported.ignored ? ` · ${t('firstRun.ignored', { n: formatNumber(imported.ignored) })}` : ''}
                </p>
              ) : null}
            </div>
            <Button disabled={!!imported && imported.done < imported.total} onClick={() => void importBookmarks()}>{t('firstRun.import')}</Button>
          </div>
        ) : null}
        <div className="np-firstrun-row">
          <div>
            <strong>{t('firstRun.model')}</strong>
            <p className="np-muted">{st.ollama ? t('firstRun.modelHint', { model: MODEL }) : t('firstRun.noOllama')}</p>
            {pull ? <p role="status">{pull.status === 'success' ? t('firstRun.modelDone') : t('firstRun.modelProgress', { pct: pull.pct })}</p> : null}
          </div>
          {st.ollama ? (
            <Button disabled={!!pull && pull.status !== 'success'} onClick={() => void pullModel()}>{t('firstRun.modelPull')}</Button>
          ) : (
            <Button variant="quiet" onClick={() => void navigate('https://ollama.com/download', { newTab: true })}>{t('firstRun.getOllama')}</Button>
          )}
        </div>
        <div className="np-consent-actions">
          <Button variant="primary" disabled={busy} onClick={() => void finish()}>{t('firstRun.continue')}</Button>
        </div>
      </div>
    </div>
  );
}
