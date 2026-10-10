import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { commands } from '../../ipc/commands';
import { systemStore } from './updates';

export function WhatsNew() {
  const t = useT();
  const rolled = systemStore.use((s) => s.rolledBackFrom);
  const news = systemStore.use((s) => s.whatsNew);
  if (!rolled && !news) return null;
  const close = () => {
    if (news) void commands.updateAckNotes();
    systemStore.set({ rolledBackFrom: null, whatsNew: null });
  };
  return (
    <div className="np-consent-backdrop">
      <div className="np-consent np-rise" role="dialog" aria-modal="true" aria-labelledby="np-whatsnew-t" onKeyDown={(e) => e.key === 'Escape' && close()}>
        {rolled ? (
          <>
            <h2 id="np-whatsnew-t">{t('updates.rolledBack.title')}</h2>
            <p>{t('updates.rolledBack.body', { version: rolled })}</p>
          </>
        ) : (
          <>
            <h2 id="np-whatsnew-t">{t('updates.whatsNew', { version: news!.version })}</h2>
            <pre className="np-notes">{news!.notes}</pre>
          </>
        )}
        <div className="np-consent-actions">
          <Button variant="primary" onClick={close}>{t('updates.close')}</Button>
        </div>
      </div>
    </div>
  );
}
