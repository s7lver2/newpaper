import { useI18n } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useMemo, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { CustomOutlet, OutletLean, TopicState } from '../../ipc/types';
import { useSetting } from '../../state/settings';
import { OutletAxis } from './OutletAxis';
import { OutletDetail } from './OutletDetail';

type Provider = 'brave' | 'tavily' | 'exa';
const PROVIDER_NAMES: Record<Provider, string> = { brave: 'Brave Search API', tavily: 'Tavily', exa: 'Exa' };
type FeedsPrefs = { searchProvider?: Provider; disabledOutlets?: string[]; leanWindowDays?: number; fetchIntervalMinutes?: number } & Record<string, unknown>;

export function SourcesSection() {
  const { t } = useI18n();
  const [contentLocale] = useSetting<string>('content.locale', 'es');
  const [all, setAll] = useState<OutletLean[]>([]);
  const [topics, setTopics] = useState<TopicState[]>([]);
  const [custom, setCustom] = useState<CustomOutlet[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [flip, setFlip] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [feeds, setFeeds] = useSetting<FeedsPrefs>('feeds.settings', {});
  const provider: Provider = feeds.searchProvider ?? 'brave';
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [form, setForm] = useState({ name: '', domain: '', feed: '' });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void commands.outletsList().then((o) => { setAll(o); setLoaded(true); });
    void commands.topicsList().then(setTopics);
    void commands.customOutletsList().then(setCustom);
  }, []);
  useEffect(() => {
    void commands.secretHas(`search.${provider}`).then(setHasKey);
  }, [provider]);

  // Solo los medios del idioma de contenidos (los demás idiomas tienen su propia lista).
  const outlets = useMemo(() => all.filter((o) => o.language === contentLocale), [all, contentLocale]);
  const disabled = useMemo(() => new Set(feeds.disabledOutlets ?? []), [feeds.disabledOutlets]);
  const current = outlets.find((o) => o.outletId === selected) ?? outlets.find((o) => o.effective !== null) ?? outlets[0] ?? null;

  const pick = (id: string) => {
    if (id === current?.outletId) return;
    setSelected(id);
    setFlip((f) => !f);
  };
  const toggle = (id: string, on: boolean) => {
    const next = new Set(disabled);
    if (on) next.delete(id);
    else next.add(id);
    void setFeeds({ ...feeds, disabledOutlets: [...next] });
  };
  const addCustom = async () => {
    const country = contentLocale === 'en' ? 'GB' : contentLocale === 'de' ? 'DE' : 'ES';
    setCustom(await commands.customOutletAdd({ name: form.name.trim(), domain: form.domain.trim(), feeds: form.feed.trim() ? [form.feed.trim()] : [], language: contentLocale, country }));
    setForm({ name: '', domain: '', feed: '' });
    setAll(await commands.outletsList());
  };

  return (
    <section className="np-settings-section np-stagger" aria-labelledby="np-set-sources">
      <div>
        <h2 id="np-set-sources" className="np-settings-h2">{t('sources.settings.title')}</h2>
        <p className="np-settings-hint">{t('sources.settings.lead')}</p>
      </div>

      {loaded && outlets.length === 0 ? (
        <p className="np-settings-hint">{t('sources.settings.empty')}</p>
      ) : (
        <OutletAxis outlets={outlets} selected={current?.outletId ?? null} disabled={disabled} onPick={pick} />
      )}

      {current ? (
        <OutletDetail
          outlet={current}
          topics={topics}
          windowDays={feeds.leanWindowDays ?? 90}
          enabled={!disabled.has(current.outletId)}
          flip={flip}
          onToggle={(on) => toggle(current.outletId, on)}
          onOverride={async (v) => setAll(await commands.outletOverrideSet(current.outletId, v))}
        />
      ) : null}

      <div className="np-settings-card np-switch-card np-src-rows">
        <div className="np-set-row">
          <div className="np-set-text">
            <div className="np-set-name">{t('sources.settings.search')}</div>
            <div className="np-set-desc">{t('sources.settings.searchHint')}</div>
          </div>
          <label className="np-sr-only" htmlFor="np-src-provider">{t('sources.settings.provider')}</label>
          <select id="np-src-provider" className="np-src-select" value={provider} onChange={(e) => void setFeeds({ ...feeds, searchProvider: e.target.value as Provider })}>
            {(Object.keys(PROVIDER_NAMES) as Provider[]).map((p) => <option key={p} value={p}>{PROVIDER_NAMES[p]}</option>)}
          </select>
        </div>
        <div className="np-set-row">
          <div className="np-set-text">
            <label htmlFor="np-src-key" className="np-set-name">{t('sources.settings.searchKey', { provider: PROVIDER_NAMES[provider] })}</label>
            <div className="np-set-desc" data-ok={hasKey}>{hasKey ? t('sources.settings.searchKeySaved') : t('sources.settings.searchKeyNone')}</div>
          </div>
          <input id="np-src-key" className="np-src-input" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
          <Button className="np-set-btn" disabled={!key} onClick={async () => { await commands.secretSet(`search.${provider}`, key); setKey(''); setHasKey(true); }}>{t('sources.settings.searchKeySave')}</Button>
        </div>
        <div className="np-set-row">
          <div className="np-set-text">
            <div className="np-set-name">{t('sources.settings.interval')}</div>
            <div className="np-set-desc">{t('sources.settings.intervalHint')}</div>
          </div>
          <span className="np-mono np-src-row-val">{t('sources.settings.minutes', { n: feeds.fetchIntervalMinutes ?? 15 })}</span>
          <Button
            className="np-set-btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await commands.feedsRefreshNow();
                setStatus(t('sources.settings.refreshed', { count: r.inserted, failed: r.feedsFailed }));
                setAll(await commands.outletsList());
              } catch {
                setStatus(t('sources.settings.refreshFailed'));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('sources.settings.refresh')}
          </Button>
        </div>
      </div>
      <p role="status" className="np-settings-hint np-src-status">{status}</p>

      <div className="np-settings-card np-switch-card np-src-rows">
        <div className="np-set-row np-src-row--head">
          <div className="np-set-text">
            <h3 className="np-set-name">{t('sources.settings.custom')}</h3>
            <div className="np-set-desc">{t('sources.settings.customHint')}</div>
          </div>
        </div>
        {custom.map((c) => (
          <div key={c.domain} className="np-set-row">
            <div className="np-set-text">
              <div className="np-set-name">{c.name}</div>
              <div className="np-set-desc np-mono">{c.domain}</div>
            </div>
            <Button className="np-set-btn" onClick={async () => { setCustom(await commands.customOutletRemove(c.domain)); setAll(await commands.outletsList()); }}>{t('sources.settings.customRemove', { name: c.name })}</Button>
          </div>
        ))}
        <div className="np-set-row np-src-row--form">
          <label className="np-settings-field"><span>{t('sources.settings.customName')}</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="np-settings-field"><span>{t('sources.settings.customDomain')}</span><input value={form.domain} placeholder={t('sources.settings.customDomainExample')} onChange={(e) => setForm({ ...form, domain: e.target.value })} /></label>
          <label className="np-settings-field np-src-grow"><span>{t('sources.settings.customFeed')}</span><input value={form.feed} placeholder={t('sources.settings.customFeedExample')} onChange={(e) => setForm({ ...form, feed: e.target.value })} /></label>
          <Button className="np-set-btn" disabled={!form.name.trim() || !form.domain.trim()} onClick={() => void addCustom()}>{t('sources.settings.customAdd')}</Button>
        </div>
      </div>
    </section>
  );
}
