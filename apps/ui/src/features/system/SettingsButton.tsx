import { useT } from '@newpaper/i18n/react';
import { IconButton } from '@newpaper/ui-kit';
import { openInternal } from '../../shell/navigate';

export function SettingsButton() {
  const t = useT();
  return (
    <IconButton
      data-tour="settings"
      label={t('tour.settingsButton')}
      icon={
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
        </svg>
      }
      onClick={() => void openInternal('ajustes')}
    />
  );
}
