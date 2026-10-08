import { useI18n } from '@newpaper/i18n/react';
import { Button, Switch } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { AdblockStatus, ListCategory } from '../../ipc/types';

const CATEGORY_KEY: Record<ListCategory, string> = {
  ads: 'privacy.blocking.categoryAds',
  privacy: 'privacy.blocking.categoryPrivacy',
  cookies: 'privacy.blocking.categoryCookies',
  newsletters: 'privacy.blocking.categoryNewsletters',
};

export function BlockingSection() {
  const { t, formatDate } = useI18n();
  const [status, setStatus] = useState<AdblockStatus | null>(null);
  const [report, setReport] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void commands.adblockStatus().then(setStatus);
  }, []);
  if (!status) return null;
  const when = (secs: number | null) => (secs ? formatDate(new Date(secs * 1000), { dateStyle: 'medium', timeStyle: 'short' }) : t('privacy.blocking.never'));

  return (
    <section className="np-settings-section" aria-labelledby="np-set-blocking">
      <h2 id="np-set-blocking" className="np-settings-h2">{t('privacy.blocking.title')}</h2>
      <Switch label={t('privacy.blocking.enabled')} checked={status.enabled} onChange={async (v) => setStatus(await commands.adblockSetEnabled(v))} />
      <h3 className="np-settings-label">{t('privacy.blocking.lists')}</h3>
      <div>
        {status.lists.map((l) => (
          <div key={l.id} className="np-list-row">
            <Switch label={l.name} checked={l.enabled} onChange={async (v) => setStatus(await commands.adblockSetList(l.id, v))} />
            <span className="np-list-meta">
              <span>{t(CATEGORY_KEY[l.category])}</span> · <span>{l.source === 'downloaded' ? t('privacy.blocking.sourceDownloaded', { date: when(l.fetchedAt) }) : t('privacy.blocking.sourceEmbedded')}</span>
            </span>
          </div>
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
