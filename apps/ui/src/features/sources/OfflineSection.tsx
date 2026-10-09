import { useT } from '@newpaper/i18n/react';
import { Button, Switch } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { OfflineSettings } from '../../ipc/types';
import { useSetting } from '../../state/settings';
import { requestEditionBuild, useEditionBuild } from './OfflineBuilder';

const DEFAULTS: OfflineSettings = { enabled: true, time: '07:00', wifiOnly: false, acOnly: false, articles: 20, maxMb: 500, expiryDays: 7 };

export function OfflineSection() {
  const t = useT();
  const [stored, save] = useSetting<Partial<OfflineSettings>>('offline.settings', {});
  const s: OfflineSettings = { ...DEFAULTS, ...stored };
  const set = (patch: Partial<OfflineSettings>) => void save({ ...s, ...patch });
  const [usedMb, setUsedMb] = useState(0);
  const build = useEditionBuild();
  useEffect(() => {
    void commands.offlineEditions().then((eds) => setUsedMb(Math.round(eds.reduce((n, e) => n + e.bytes, 0) / 1048576)));
  }, [build.lastCount]);
  const num = (label: string, value: number, key: keyof OfflineSettings, min: number, max: number) => (
    <label className="np-settings-field">
      <span>{label}</span>
      <input type="number" min={min} max={max} value={value} onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<OfflineSettings>)} />
    </label>
  );
  return (
    <section className="np-settings-section" aria-labelledby="np-set-offline">
      <h2 id="np-set-offline" className="np-settings-h2">{t('sources.offline.title')}</h2>
      <Switch label={t('sources.offline.enabled')} checked={s.enabled} onChange={(v) => set({ enabled: v })} />
      <label className="np-settings-field">
        <span>{t('sources.offline.time')}</span>
        <input type="time" value={s.time} onChange={(e) => set({ time: e.target.value })} />
      </label>
      <Switch label={t('sources.offline.wifiOnly')} checked={s.wifiOnly} onChange={(v) => set({ wifiOnly: v })} />
      <Switch label={t('sources.offline.acOnly')} checked={s.acOnly} onChange={(v) => set({ acOnly: v })} />
      <div className="np-settings-actions">
        {num(t('sources.offline.articles'), s.articles, 'articles', 5, 60)}
        {num(t('sources.offline.maxMb'), s.maxMb, 'maxMb', 50, 5000)}
        {num(t('sources.offline.expiry'), s.expiryDays, 'expiryDays', 1, 60)}
      </div>
      <p className="np-mono">{t('sources.offline.used', { used: usedMb, limit: s.maxMb })}</p>
      <p className="np-settings-hint">{t('sources.offline.expiryNote')}</p>
      <Button disabled={build.running} onClick={() => void requestEditionBuild()}>
        {build.running ? t('sources.offline.building', { done: build.done, total: build.total }) : t('sources.offline.buildNow')}
      </Button>
    </section>
  );
}
