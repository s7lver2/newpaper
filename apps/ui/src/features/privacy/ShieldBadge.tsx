import { useI18n } from '@newpaper/i18n/react';
import { Button, Switch } from '@newpaper/ui-kit';
import { useEffect, useId, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { TabInfo } from '../../ipc/types';
import { openInternal } from '../../shell/navigate';
import { useBlockedCount, useTodayBlocked } from './usePrivacy';

const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
  </svg>
);

export function ShieldBadge({ tab }: { tab: TabInfo | null }) {
  const { t, formatNumber } = useI18n();
  const count = useBlockedCount(tab?.id ?? null);
  const today = useTodayBlocked();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    void commands.adblockStatus().then((s) => setEnabled(s.enabled));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="np-shield">
      <button
        type="button"
        className="np-shield-btn"
        aria-label={t('privacy.shield.label', { count })}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <ShieldIcon />
        <span className="np-shield-count np-mono" aria-hidden="true">{formatNumber(count, { useGrouping: false })}</span>
      </button>
      {open ? (
        <div id={panelId} role="dialog" aria-label={t('privacy.shield.title')} className="np-popover np-pop">
          <dl className="np-shield-stats">
            <div><dt>{t('privacy.shield.page')}</dt><dd className="np-mono">{formatNumber(count, { useGrouping: false })}</dd></div>
            <div><dt>{t('privacy.shield.today')}</dt><dd className="np-mono">{formatNumber(today, { useGrouping: false })}</dd></div>
          </dl>
          <Switch
            label={t('privacy.shield.enabled')}
            checked={enabled}
            onChange={(v) => {
              setEnabled(v);
              void commands.adblockSetEnabled(v);
            }}
          />
          <Button variant="quiet" onClick={() => { setOpen(false); void openInternal('ajustes', ['bloqueo']); }}>
            {t('privacy.shield.settings')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
