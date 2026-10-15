import { useI18n } from '@newpaper/i18n/react';
import { useEffect, useState } from 'react';
import { resetPipeline } from '../ai/pipeline';
import { Switch, Toast } from '../components';
import { ipc, type AdblockStatus, type MonthUsage, type TopicState } from '../ipc';
import { Bar } from './Bar';

type Preset = 'privacy' | 'balanced' | 'quality' | 'cheap';
const PRESETS: Preset[] = ['privacy', 'balanced', 'quality', 'cheap'];

/** Pipeline de análisis (versión móvil): preset de calidad, límite mensual y análisis rápido al abrir. Los modelos por paso se asignan solos según el preset. */
export function Pipeline() {
  const { t, formatNumber } = useI18n();
  const [preset, setPreset] = useState<Preset>('balanced');
  const [limit, setLimit] = useState('');
  const [quick, setQuick] = useState(true);
  const [usage, setUsage] = useState<MonthUsage | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    void ipc.settingsGet<Preset>('ai.preset').then((v) => v && setPreset(v)).catch(() => {});
    void ipc.settingsGet<number>('ai.monthlyLimitUsd').then((v) => setLimit(typeof v === 'number' ? String(v) : '')).catch(() => {});
    void ipc.settingsGet<boolean>('ai.quickOnOpen').then((v) => setQuick(v ?? true)).catch(() => {});
    void ipc.usageMonth().then(setUsage).catch(() => {});
  }, []);
  const saved = () => {
    resetPipeline();
    setToast(t('mobile.pipeline.saved'));
    setTimeout(() => setToast(null), 1600);
  };
  const pickPreset = (p: Preset) => {
    setPreset(p);
    // Cambiar de preset vuelve a la asignación automática: se descarta cualquier asignación manual guardada.
    void ipc.settingsSet('ai.assignments', {}).catch(() => {});
    void ipc.settingsSet('ai.preset', p).then(saved);
  };
  const saveLimit = () => {
    const n = Number(limit.replace(',', '.'));
    void ipc.settingsSet('ai.monthlyLimitUsd', limit.trim() === '' || !Number.isFinite(n) || n < 0 ? null : n).then(saved);
  };
  return (
    <section>
      <Bar title={t('mobile.pipeline.title')} />
      <p className="m-sub">{t('mobile.pipeline.lead')}</p>
      <h2 className="m-sec">{t('providers.preset.label')}</h2>
      <div className="m-group" role="radiogroup" aria-label={t('providers.preset.label')}>
        {PRESETS.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={preset === p} className="m-row m-radio-row" onClick={() => pickPreset(p)}>
            <span className="m-row-body">
              <b>{t(`providers.preset.${p}`)}</b>
              <span>{t(`providers.presetHint.${p}`)}</span>
            </span>
            <i className="m-radio-dot" aria-hidden="true" />
          </button>
        ))}
      </div>
      <p className="m-hint">{t('providers.auto')}</p>
      <h2 className="m-sec">{t('providers.budget')}</h2>
      <label className="m-field">
        <span>{t('providers.limit')}</span>
        <input className="m-input" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} onBlur={saveLimit} />
      </label>
      <p className="m-hint">{t('providers.limitHint')}</p>
      {usage ? <p className="m-sub">{t('providers.spent', { amount: formatNumber(usage.cost, { style: 'currency', currency: 'USD' }) })}</p> : null}
      <h2 className="m-sec">{t('mobile.pipeline.title')}</h2>
      <div className="m-group">
        <div className="m-row">
          <span className="m-row-body">
            <b>{t('mobile.pipeline.quickOnOpen')}</b>
            <span>{t('mobile.pipeline.quickOnOpenSub')}</span>
          </span>
          <Switch checked={quick} label={t('mobile.pipeline.quickOnOpen')} onChange={(v) => { setQuick(v); void ipc.settingsSet('ai.quickOnOpen', v).then(saved); }} />
        </div>
      </div>
      <Toast text={toast} />
    </section>
  );
}

/** Bloqueo de anuncios y rastreadores: interruptor general y listas de filtros. */
export function Blocking() {
  const { t, formatDate } = useI18n();
  const [st, setSt] = useState<AdblockStatus | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void ipc.adblockStatus().then(setSt).catch(() => {});
  }, []);
  const say = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(null), 2200);
  };
  const refresh = async () => {
    setBusy(true);
    try {
      const r = await ipc.adblockRefresh();
      setSt(await ipc.adblockStatus());
      say(r.failed.length ? t('privacy.blocking.refreshFailed', { count: r.failed.length }) : t('privacy.blocking.refreshed', { count: r.updated.length }));
    } catch {
      say(t('privacy.blocking.refreshFailed', { count: 1 }));
    } finally {
      setBusy(false);
    }
  };
  const catKey = { ads: 'categoryAds', privacy: 'categoryPrivacy', cookies: 'categoryCookies', newsletters: 'categoryNewsletters' } as const;
  return (
    <section>
      <Bar title={t('privacy.blocking.title')} />
      <p className="m-sub">{t('privacy.blocking.lead')}</p>
      {st ? (
        <>
          <div className="m-group" style={{ marginTop: 16 }}>
            <div className="m-row">
              <span className="m-row-body"><b>{t('privacy.blocking.enabled')}</b></span>
              <Switch checked={st.enabled} label={t('privacy.blocking.enabled')} onChange={(v) => void ipc.adblockSetEnabled(v).then(setSt)} />
            </div>
          </div>
          <h2 className="m-sec">{t('privacy.blocking.lists')}</h2>
          <div className="m-group">
            {st.lists.map((l) => (
              <div key={l.id} className="m-row">
                <span className="m-row-body">
                  <b>{l.name}</b>
                  <span>
                    {t(`privacy.blocking.${catKey[l.category]}`)} ·{' '}
                    {l.source === 'downloaded' && l.fetchedAt ? t('privacy.blocking.sourceDownloaded', { date: formatDate(new Date(l.fetchedAt * 1000), { dateStyle: 'medium' }) }) : t('privacy.blocking.sourceEmbedded')}
                  </span>
                </span>
                <Switch checked={l.enabled} label={l.name} onChange={(v) => void ipc.adblockSetList(l.id, v).then(setSt)} />
              </div>
            ))}
          </div>
          <div className="m-btn-row" style={{ marginTop: 18 }}>
            <button type="button" className="m-btn sec" disabled={busy} onClick={() => void refresh()}>{t('privacy.blocking.refresh')}</button>
          </div>
          <p className="m-hint">{t('privacy.blocking.engine', { when: st.lastRefresh ? formatDate(new Date(st.lastRefresh * 1000), { dateStyle: 'medium' }) : t('privacy.blocking.never') })}</p>
        </>
      ) : (
        <div style={{ padding: '16px var(--m-gutter)', display: 'grid', gap: 12 }}>
          <span className="m-skel" style={{ height: 60 }} />
          <span className="m-skel" style={{ height: 120 }} />
        </div>
      )}
      <Toast text={toast} />
    </section>
  );
}

/** Fuentes y temas: qué temas sigues (salen primero en Hoy). */
export function Sources() {
  const { t } = useI18n();
  const [topics, setTopics] = useState<TopicState[] | null>(null);
  useEffect(() => {
    void ipc.topicsList().then(setTopics).catch(() => setTopics([]));
  }, []);
  return (
    <section>
      <Bar title={t('mobile.sources.title')} />
      <p className="m-sub">{t('mobile.sources.lead')}</p>
      <h2 className="m-sec">{t('sources.offline.topics')}</h2>
      {topics === null ? (
        <div style={{ padding: '0 var(--m-gutter)' }}><span className="m-skel" style={{ height: 120 }} /></div>
      ) : topics.length === 0 ? (
        <p className="m-empty">{t('mobile.sources.none')}</p>
      ) : (
        <div className="m-group">
          {topics.map((x) => (
            <div key={x.id} className="m-row">
              <span className="m-row-body"><b>{x.name}</b></span>
              <Switch checked={x.following} label={x.name} onChange={(v) => void ipc.topicSetFollowing(x.id, v).then(setTopics)} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
