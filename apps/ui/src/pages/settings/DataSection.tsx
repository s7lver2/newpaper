import { useT } from '@newpaper/i18n/react';
import { Button, SegmentedControl, Switch } from '@newpaper/ui-kit';
import { useState } from 'react';
import { commands } from '../../ipc/commands';
import type { DeleteScope } from '../../ipc/types';
import { useSetting } from '../../state/settings';

type Retention = '7' | '30' | '90' | '365' | 'forever';
const toValue = (r: Retention): number | null => (r === 'forever' ? null : Number(r));
const fromValue = (v: number | null): Retention => (v === null ? 'forever' : (String(v) as Retention));

export function DataSection() {
  const t = useT();
  const [retention, setRetention] = useSetting<number | null>('history.retentionDays', 90);
  const [paused, setPaused] = useSetting<boolean>('history.paused', false);
  const [outlet, setOutlet] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const del = async (scope: DeleteScope) => {
    const n = await commands.historyDelete(scope);
    setStatus(t('settings.data.deleted', { count: n }));
  };

  return (
    <section className="np-settings-section" aria-labelledby="np-set-data">
      <h2 id="np-set-data" className="np-settings-h2">{t('settings.data.title')}</h2>
      <div className="np-settings-row">
        <span className="np-settings-label">{t('settings.data.retention')}</span>
        <SegmentedControl<Retention>
          label={t('settings.data.retention')}
          value={fromValue(retention)}
          options={[
            { value: '7', label: t('settings.data.retention7') },
            { value: '30', label: t('settings.data.retention30') },
            { value: '90', label: t('settings.data.retention90') },
            { value: '365', label: t('settings.data.retention365') },
            { value: 'forever', label: t('settings.data.retentionForever') },
          ]}
          onChange={(r) => void setRetention(toValue(r))}
        />
      </div>
      <Switch label={t('settings.data.pause')} description={t('settings.data.pauseHint')} checked={paused} onChange={(v) => void setPaused(v)} />
      <div className="np-settings-actions">
        <Button onClick={() => del({ scope: 'range', from: Date.now() - 86_400_000, to: Date.now() + 1 })}>{t('settings.data.deleteDay')}</Button>
        <Button variant="danger" onClick={() => del({ scope: 'all' })}>{t('settings.data.deleteAll')}</Button>
      </div>
      <div className="np-settings-actions">
        <label className="np-settings-field">
          <span>{t('settings.data.outletLabel')}</span>
          <input type="text" value={outlet} onChange={(e) => setOutlet(e.target.value)} />
        </label>
        <Button disabled={!outlet.trim()} onClick={() => del({ scope: 'outlet', outlet: outlet.trim().toLowerCase().replace(/^www\./, '') })}>
          {t('settings.data.deleteOutlet')}
        </Button>
      </div>
      <p role="status" className="np-settings-hint">{status}</p>
    </section>
  );
}
