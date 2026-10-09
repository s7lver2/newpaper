import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useId, useRef, useState } from 'react';

export function ConsentDialog({ open, onConfirm, onCancel }: { open: boolean; onConfirm(ack: true): void; onCancel(): void }) {
  const t = useT();
  const [checked, setChecked] = useState(false);
  const id = useId();
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setChecked(false);
      box.current?.focus();
    }
  }, [open]);
  if (!open) return null;
  return (
    <div className="np-consent-backdrop">
      <div className="np-consent np-rise" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
        <h2 id={`${id}-t`}>{t('noCoverage.consent.title')}</h2>
        <p>{t('noCoverage.consent.body')}</p>
        <label className="np-consent-check">
          <input ref={box} type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          <span>{t('noCoverage.consent.checkbox')}</span>
        </label>
        <div className="np-consent-actions">
          <Button onClick={onCancel}>{t('noCoverage.consent.cancel')}</Button>
          <Button variant="primary" disabled={!checked} onClick={() => checked && onConfirm(true)}>
            {t('noCoverage.consent.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
