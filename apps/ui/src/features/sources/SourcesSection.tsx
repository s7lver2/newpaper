import { useI18n } from '@newpaper/i18n/react';
import { Button, SegmentedControl } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { CustomOutlet, OutletLean } from '../../ipc/types';
import { useSetting } from '../../state/settings';
import { OutletAxis } from './OutletAxis';

type Provider = 'brave' | 'tavily' | 'exa';
const PROVIDER_NAMES: Record<Provider, string> = { brave: 'Brave Search', tavily: 'Tavily', exa: 'Exa' };

export function SourcesSection() {
  const { t, locale } = useI18n();
  const [outlets, setOutlets] = useState<OutletLean[]>([]);
  const [custom, setCustom] = useState<CustomOutlet[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');
  const [feeds, setFeeds] = useSetting<{ searchProvider?: Provider } & Record<string, unknown>>('feeds.settings', {});
  const provider: Provider = feeds.searchProvider ?? 'brave';
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [form, setForm] = useState({ name: '', domain: '', feed: '' });

  useEffect(() => {
    void commands.outletsList().then(setOutlets);
    void commands.customOutletsList().then(setCustom);
  }, []);
  useEffect(() => {
    void commands.secretHas(`search.${provider}`).then(setHasKey);
  }, [provider]);

  const fmt = (v: number) => String(Math.round(v));
  return (
    <section className="np-settings-section" aria-labelledby="np-set-sources">
      <h2 id="np-set-sources" className="np-settings-h2">{t('sources.settings.title')}</h2>
      <p className="np-settings-label">{t('sources.settings.axis')}</p>
      <OutletAxis outlets={outlets} />
      <p className="np-settings-hint">{t('sources.settings.axisNote')}</p>
      <div>
        {outlets.map((o) => (
          <div key={o.outletId} className="np-outlet-row">
            <strong>{o.name}</strong>
            <span className="np-mono">
              {o.effective === null ? t('sources.settings.noData') : t('sources.settings.value', { value: fmt(o.effective), uncertainty: fmt(o.effectiveUncertainty ?? 0) })}
              {o.overrideLean !== null ? <> · {t('sources.settings.override')}</> : null}
            </span>
            {o.reliability ? (
              <span className="np-settings-hint">{t('sources.settings.reliability', { pct: Math.round(o.reliability.ratio * 100), n: o.reliability.n })}</span>
            ) : <span />}
            <span className="np-settings-actions">
              <input
                type="number" min={0} max={100}
                aria-label={t('sources.settings.overrideLabel', { outlet: o.name })}
                value={drafts[o.outletId] ?? (o.overrideLean ?? '').toString()}
                onChange={(e) => setDrafts({ ...drafts, [o.outletId]: e.target.value })}
              />
              <Button onClick={async () => {
                const v = drafts[o.outletId];
                setOutlets(await commands.outletOverrideSet(o.outletId, v === undefined || v === '' ? null : Number(v)));
              }}>{t('sources.settings.overrideSave')}</Button>
              {o.overrideLean !== null ? (
                <Button variant="quiet" onClick={async () => setOutlets(await commands.outletOverrideSet(o.outletId, null))}>{t('sources.settings.overrideRemove')}</Button>
              ) : null}
            </span>
          </div>
        ))}
      </div>

      <h3 className="np-settings-label">{t('sources.settings.custom')}</h3>
      <ul>
        {custom.map((c) => (
          <li key={c.domain}>
            {c.name} <span className="np-mono">{c.domain}</span>{' '}
            <Button variant="quiet" onClick={async () => setCustom(await commands.customOutletRemove(c.domain))}>{t('sources.settings.customRemove', { name: c.name })}</Button>
          </li>
        ))}
      </ul>
      <div className="np-settings-actions">
        <label className="np-settings-field"><span>{t('sources.settings.customName')}</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="np-settings-field"><span>{t('sources.settings.customDomain')}</span><input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} /></label>
        <label className="np-settings-field"><span>{t('sources.settings.customFeed')}</span><input value={form.feed} onChange={(e) => setForm({ ...form, feed: e.target.value })} /></label>
        <Button disabled={!form.name || !form.domain} onClick={async () => {
          setCustom(await commands.customOutletAdd({ name: form.name, domain: form.domain, feeds: form.feed ? [form.feed] : [], language: locale, country: locale === 'en' ? 'GB' : locale === 'de' ? 'DE' : 'ES' }));
          setForm({ name: '', domain: '', feed: '' });
        }}>{t('sources.settings.customAdd')}</Button>
      </div>

      <h3 className="np-settings-label">{t('sources.settings.search')}</h3>
      <p className="np-settings-hint">{t('sources.settings.searchHint')}</p>
      <SegmentedControl<Provider>
        label={t('sources.settings.search')}
        value={provider}
        options={(['brave', 'tavily', 'exa'] as Provider[]).map((p) => ({ value: p, label: PROVIDER_NAMES[p] }))}
        onChange={(p) => void setFeeds({ ...feeds, searchProvider: p })}
      />
      <div className="np-settings-actions">
        <label className="np-settings-field">
          <span>{t('sources.settings.searchKey', { provider: PROVIDER_NAMES[provider] })}</span>
          <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <Button disabled={!key} onClick={async () => { await commands.secretSet(`search.${provider}`, key); setKey(''); setHasKey(true); }}>{t('sources.settings.searchKeySave')}</Button>
        {hasKey ? <span className="np-settings-hint">{t('sources.settings.searchKeySaved')}</span> : null}
      </div>

      <div className="np-settings-actions">
        <Button onClick={async () => {
          const r = await commands.feedsRefreshNow();
          setStatus(t('sources.settings.refreshed', { count: r.inserted, failed: r.feedsFailed }));
          setOutlets(await commands.outletsList());
        }}>{t('sources.settings.refresh')}</Button>
      </div>
      <p role="status" className="np-settings-hint">{status}</p>
    </section>
  );
}
