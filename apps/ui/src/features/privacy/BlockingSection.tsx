import { useI18n } from '@newpaper/i18n/react';
import { Button, Switch, useCountUp } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { AdblockStatus, ListCategory } from '../../ipc/types';
import { useTodayBlocked } from './usePrivacy';

const CATEGORY_KEY: Record<ListCategory, string> = {
  ads: 'privacy.blocking.categoryAds',
  privacy: 'privacy.blocking.categoryPrivacy',
  cookies: 'privacy.blocking.categoryCookies',
  newsletters: 'privacy.blocking.categoryNewsletters',
};

export function BlockingSection() {
  const { t, formatDate, formatNumber } = useI18n();
  const today = useTodayBlocked();
  const shown = useCountUp(today);
  const [status, setStatus] = useState<AdblockStatus | null>(null);
  const [report, setReport] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void commands.adblockStatus().then(setStatus);
  }, []);
  if (!status) return null;
  const when = (secs: number | null) => (secs ? formatDate(new Date(secs * 1000), { dateStyle: 'medium', timeStyle: 'short' }) : t('privacy.blocking.never'));

  return (
    <section className="np-settings-section np-stagger" aria-labelledby="np-set-blocking">
      <div>
        <h2 id="np-set-blocking" className="np-settings-h2">{t('privacy.blocking.title')}</h2>
        <p className="np-settings-hint">{t('privacy.blocking.lead')}</p>
      </div>
      <div className="np-stats">
        <div className="np-stat">
          <span className="np-stat-label">{t('privacy.shield.today')}</span>
          <span className="np-stat-value">{formatNumber(shown, { useGrouping: false })}</span>
        </div>
      </div>
      <div className="np-settings-card np-switch-card">
        <Switch label={t('privacy.blocking.enabled')} checked={status.enabled} onChange={async (v) => setStatus(await commands.adblockSetEnabled(v))} />
      </div>
      <h3 className="np-settings-label np-sr-only">{t('privacy.blocking.lists')}</h3>
      <div className="np-settings-card np-switch-card">
        {status.lists.map((l) => (
          <Switch
            key={l.id}
            label={l.name}
            description={
              <>
                <span>{t(CATEGORY_KEY[l.category])}</span> · <span>{l.source === 'downloaded' ? t('privacy.blocking.sourceDownloaded', { date: when(l.fetchedAt) }) : t('privacy.blocking.sourceEmbedded')}</span>
              </>
            }
            checked={l.enabled}
            onChange={async (v) => setStatus(await commands.adblockSetList(l.id, v))}
          />
        ))}
      </div>
      <div className="np-settings-actions">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await commands.adblockRefresh();
              const parts = [t('privacy.blocking.refreshed', { count: r.updated.length })];
              if (r.failed.length) parts.push(t('privacy.blocking.refreshFailed', { count: r.failed.length }));
              setReport(parts.join(' · '));
              setStatus(await commands.adblockStatus());
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('privacy.blocking.refresh')}
        </Button>
      </div>
      <p role="status" className="np-settings-hint">{report}</p>
      <p className="np-settings-hint np-mono">{t('privacy.blocking.engine', { when: when(status.lastRefresh) })}</p>
    </section>
  );
}
