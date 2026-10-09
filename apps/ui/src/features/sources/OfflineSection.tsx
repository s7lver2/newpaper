import { useI18n } from '@newpaper/i18n/react';
import { Button, Switch } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { Edition, OfflineSettings, SavedArticle, TopicState } from '../../ipc/types';
import { useSetting } from '../../state/settings';
import { requestEditionBuild, useEditionBuild } from './OfflineBuilder';

export const OFFLINE_DEFAULTS: OfflineSettings = { enabled: true, time: '07:00', wifiOnly: false, acOnly: false, articles: 20, maxMb: 500, expiryDays: 7 };
const LIMITS = [250, 500, 1000];
const EXPIRIES = [3, 7, 14];
const MB = 1048576;

export function OfflineSection() {
  const { t, formatNumber } = useI18n();
  const [stored, save] = useSetting<Partial<OfflineSettings>>('offline.settings', {});
  const s: OfflineSettings = { ...OFFLINE_DEFAULTS, ...stored };
  const set = (patch: Partial<OfflineSettings>) => void save({ ...s, ...patch });
  const [editions, setEditions] = useState<Edition[]>([]);
  const [saved, setSaved] = useState<SavedArticle[]>([]);
  const [topics, setTopics] = useState<TopicState[]>([]);
  const build = useEditionBuild();
  useEffect(() => {
    void commands.offlineEditions().then(setEditions);
    void commands.savedList().then(setSaved);
  }, [build.lastCount]);
  useEffect(() => {
    void commands.topicsList().then(setTopics);
  }, []);

  const editionMb = editions.reduce((n, e) => n + e.bytes, 0) / MB;
  const savedMb = saved.reduce((n, a) => n + a.articleJson.length, 0) / MB;
  const usedMb = editionMb + savedMb;
  const ready = editions.filter((e) => e.status === 'ready' && e.articleCount > 0);
  const perArticleMb = ready.length ? ready.reduce((n, e) => n + e.bytes, 0) / MB / ready.reduce((n, e) => n + e.articleCount, 0) : null;
  const mb1 = (v: number) => formatNumber(v, { maximumFractionDigits: 1 });
  const usage = [
    { key: 'edition', label: t('sources.offline.usageEdition'), mb: editionMb, color: 'var(--np-ink)' },
    { key: 'saved', label: t('sources.offline.usageSaved'), mb: savedMb, color: 'var(--np-accent)' },
  ];
  const toggleTopic = async (id: string, following: boolean) => setTopics(await commands.topicSetFollowing(id, following));

  return (
    <section className="np-settings-section np-stagger" aria-labelledby="np-set-offline">
      <div>
        <h2 id="np-set-offline" className="np-settings-h2">{t('sources.offline.title')}</h2>
        <p className="np-settings-hint">{t('sources.offline.lead')}</p>
      </div>
      <div className="np-settings-card np-switch-card np-src-rows">
        <Switch label={t('sources.offline.enabled')} description={t('sources.offline.enabledHint')} checked={s.enabled} onChange={(v) => set({ enabled: v })} />
        <div className="np-set-row">
          <label htmlFor="np-off-time" className="np-set-text np-set-name">{t('sources.offline.time')}</label>
          <input id="np-off-time" className="np-off-time" type="time" value={s.time} onChange={(e) => e.target.value && set({ time: e.target.value })} />
        </div>
        <Switch label={t('sources.offline.wifiOnly')} description={t('sources.offline.wifiOnlyHint')} checked={s.wifiOnly} onChange={(v) => set({ wifiOnly: v })} />
        <Switch label={t('sources.offline.acOnly')} description={t('sources.offline.acOnlyHint')} checked={s.acOnly} onChange={(v) => set({ acOnly: v })} />

        <div className="np-off-block">
          <div className="np-off-label" id="np-off-topics">{t('sources.offline.topics')}</div>
          <div className="np-off-topics" role="group" aria-labelledby="np-off-topics" style={{ marginTop: 8 }}>
            {topics.map((tp) => (
              <button key={tp.id} type="button" className="np-off-chip" aria-pressed={tp.following} onClick={() => void toggleTopic(tp.id, !tp.following)}>{tp.name}</button>
            ))}
          </div>
          {topics.length && !topics.some((x) => x.following) ? <div className="np-set-desc" style={{ marginTop: 8 }}>{t('sources.offline.topicsNone')}</div> : null}
        </div>

        <div className="np-off-block">
          <div className="np-off-block-head">
            <label htmlFor="np-off-count" className="np-off-label">{t('sources.offline.articles')}</label>
            <span className="np-mono np-off-val--lg">{s.articles}{perArticleMb !== null ? ` · ≈ ${t('sources.offline.mb', { mb: mb1(s.articles * perArticleMb) })}` : ''}</span>
          </div>
          <input id="np-off-count" className="np-src-range" type="range" min={10} max={60} step={5} value={Math.min(60, Math.max(10, s.articles))} onChange={(e) => set({ articles: Number(e.target.value) })} />
        </div>

        <div className="np-off-block">
          <div className="np-off-block-head">
            <span className="np-off-label" id="np-off-limit">{t('sources.offline.maxMb')}</span>
            <span className="np-mono np-off-val">{t('sources.offline.used', { used: mb1(usedMb), limit: s.maxMb })}</span>
          </div>
          <div className="np-off-bar" aria-hidden="true">
            {usage.map((u, i) => <span key={u.key} style={{ width: `${Math.min(100, (u.mb / s.maxMb) * 100)}%`, background: u.color, transitionDelay: `${i * 80}ms` }} />)}
          </div>
          <div className="np-off-legend">
            {usage.map((u) => <span key={u.key}><i style={{ background: u.color }} />{u.label} · {t('sources.offline.mb', { mb: mb1(u.mb) })}</span>)}
          </div>
          <div className="np-off-seg" role="radiogroup" aria-labelledby="np-off-limit">
            {LIMITS.map((v) => <button key={v} type="button" role="radio" aria-checked={s.maxMb === v} onClick={() => set({ maxMb: v })}>{t('sources.offline.mb', { mb: v })}</button>)}
          </div>
          {usedMb > s.maxMb ? <div className="np-off-over np-rise">{t('sources.offline.over')}</div> : null}
        </div>

        <div className="np-off-block">
          <div className="np-off-label" id="np-off-expiry" style={{ marginBottom: 8 }}>{t('sources.offline.expiry')}</div>
          <div className="np-off-seg" role="radiogroup" aria-labelledby="np-off-expiry">
            {EXPIRIES.map((v) => <button key={v} type="button" role="radio" aria-checked={s.expiryDays === v} onClick={() => set({ expiryDays: v })}>{t('sources.offline.days', { n: v })}</button>)}
          </div>
          <div className="np-set-desc" style={{ marginTop: 8, fontSize: 12 }}>{t('sources.offline.expiryNote', { n: s.expiryDays })}</div>
        </div>
      </div>

      <div className="np-off-actions">
        <Button variant="primary" className="np-off-build" disabled={build.running} onClick={() => void requestEditionBuild()}>
          {build.running ? t('sources.offline.building', { done: build.done, total: build.total }) : t('sources.offline.buildNow')}
        </Button>
        {build.running ? <div className="np-off-progress" aria-hidden="true"><span style={{ width: `${build.total ? (build.done / build.total) * 100 : 4}%` }} /></div> : null}
        {!build.running && build.lastCount !== null ? <span role="status" className="np-settings-hint">{t('sources.offline.built', { count: build.lastCount })}</span> : null}
      </div>
    </section>
  );
}
