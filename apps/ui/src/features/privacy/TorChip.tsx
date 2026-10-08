import { useT } from '@newpaper/i18n/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TabInfo } from '../../ipc/types';
import { TorPopup, torStateLabel } from './TorPopup';
import { usePrivacyStatus } from './usePrivacy';

export function TorChip({ tab }: { tab: TabInfo | null }) {
  const t = useT();
  const status = usePrivacyStatus();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (e.target instanceof Node && !wrap.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);
  if (!status) return null;
  const without = tab !== null && status.tabsWithoutTor.includes(tab.id);
  const label =
    status.mode === 'direct'
      ? t('privacy.tor.chipDirect')
      : without
        ? t('privacy.tor.withoutTor')
        : t('privacy.tor.chipTor', { country: status.exitCountry ?? t('privacy.tor.auto') });
  return (
    <div ref={wrap} className="np-torchip-wrap">
      <button
        type="button"
        className="np-torchip"
        data-mode={status.mode}
        data-failed={status.mode === 'tor' && status.tor.state === 'failed'}
        data-without={without}
        aria-expanded={open}
        aria-label={t('privacy.tor.chipLabel', { status: `${label} · ${torStateLabel(t, status)}` })}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={status.tor.state === 'bootstrapping' ? 'np-tor-dot np-pulse' : 'np-tor-dot'} aria-hidden="true" />
        {label}
      </button>
      {open ? <TorPopup tabId={tab?.id ?? null} onClose={close} /> : null}
    </div>
  );
}
