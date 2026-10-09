import { useI18n } from '@newpaper/i18n/react';
import { Button, Switch } from '@newpaper/ui-kit';
import { useEffect, useId, useRef, useState } from 'react';
import { useUnderlay } from '../../shell/underlay';
import { commands } from '../../ipc/commands';
import type { TabInfo } from '../../ipc/types';
import { openInternal } from '../../shell/navigate';
import { useBlockedCount, useTodayBlocked } from './usePrivacy';

const ShieldIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6l8-3z" />
  </svg>
);

export function ShieldBadge({ tab }: { tab: TabInfo | null }) {
  const { t, formatNumber } = useI18n();
  const count = useBlockedCount(tab?.id ?? null);
  const today = useTodayBlocked();
  const [open, setOpen] = useState(false);
  useUnderlay(open);
  const [enabled, setEnabled] = useState(true);
  const panelId = useId();
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void commands.adblockStatus().then((s) => setEnabled(s.enabled));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !wrap.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <div ref={wrap} className="np-shield">
      <button
        type="button"
        className="np-shield-btn np-hit"
        aria-label={t('privacy.shield.label', { count })}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <ShieldIcon />
        <span className="np-shield-count np-mono" aria-hidden="true">{formatNumber(count, { useGrouping: false })}</span>
      </button>
      {open ? (
        <div id={panelId} role="dialog" aria-label={t('privacy.shield.title')} className="np-popover">
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
