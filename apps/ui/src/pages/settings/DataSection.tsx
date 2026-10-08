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
    <section className="np-settings-section np-stagger" aria-labelledby="np-set-data">
      <div>
        <h2 id="np-set-data" className="np-settings-h2">{t('settings.data.title')}</h2>
        <p className="np-settings-hint">{t('settings.data.lead')}</p>
      </div>
      <div className="np-settings-card np-switch-card">
        <div className="np-set-row">
          <div className="np-set-text">
            <span className="np-set-name">{t('settings.data.retention')}</span>
            <span className="np-set-desc">{t('settings.data.retentionHint')}</span>
          </div>
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
        <div className="np-set-row">
          <div className="np-set-text">
            <span className="np-set-name">{t('settings.data.deleteDay')}</span>
            <span className="np-set-desc">{t('settings.data.deleteDayHint')}</span>
          </div>
          <Button className="np-set-btn" aria-label={t('settings.data.deleteDay')} onClick={() => del({ scope: 'range', from: Date.now() - 86_400_000, to: Date.now() + 1 })}>{t('settings.data.deleteAction')}</Button>
        </div>
        <div className="np-set-row">
          <div className="np-set-text">
            <span className="np-set-name">{t('settings.data.deleteAll')}</span>
            <span className="np-set-desc">{t('settings.data.deleteAllHint')}</span>
          </div>
          <Button variant="danger" className="np-set-btn" aria-label={t('settings.data.deleteAll')} onClick={() => del({ scope: 'all' })}>{t('settings.data.deleteAction')}</Button>
        </div>
        <div className="np-set-row">
          <div className="np-set-text">
            <span className="np-set-name">{t('settings.data.deleteOutlet')}</span>
            <span className="np-set-desc">{t('settings.data.deleteOutletHint')}</span>
          </div>
          <label className="np-set-field">
            <span className="np-sr-only">{t('settings.data.outletLabel')}</span>
            <input type="text" placeholder={t('settings.data.outletLabel')} value={outlet} onChange={(e) => setOutlet(e.target.value)} />
          </label>
          <Button
            className="np-set-btn"
            aria-label={t('settings.data.deleteOutlet')}
            disabled={!outlet.trim()}
            onClick={() => del({ scope: 'outlet', outlet: outlet.trim().toLowerCase().replace(/^www\./, '') })}
          >
            {t('settings.data.deleteAction')}
          </Button>
        </div>
      </div>
      <p role="status" className="np-settings-hint">{status}</p>
    </section>
  );
}
