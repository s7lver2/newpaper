import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useId, useRef } from 'react';
import { commands } from '../../ipc/commands';
import { applyStatus } from './usePrivacy';
import { cancelOpenWithoutTor, withoutTorStore } from './withoutTor';

export function OpenWithoutTorDialog() {
  const t = useT();
  const tabId = withoutTorStore.use((s) => s.pendingTabId);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (tabId === null) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancelOpenWithoutTor();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tabId]);

  if (tabId === null) return null;
  return (
    <div className="np-dialog-scrim">
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} className="np-dialog np-pop">
        <h2 id={titleId}>{t('privacy.withoutTor.title')}</h2>
        <p id={bodyId}>{t('privacy.withoutTor.body')}</p>
        <div className="np-dialog-actions">
          <Button ref={cancelRef} onClick={cancelOpenWithoutTor}>{t('common.cancel')}</Button>
          <Button
            variant="danger"
            onClick={async () => {
              cancelOpenWithoutTor();
              applyStatus(await commands.tabWithoutTor(tabId));
            }}
          >
            {t('privacy.withoutTor.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
