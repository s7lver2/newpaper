import { useT } from '@newpaper/i18n/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useUnderlay } from '../../../shell/underlay';

/** `**texto**` → negrita (los mensajes i18n no llevan HTML). */
export const emphasize = (s: string): ReactNode[] => s.split('**').map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));

/** Confirmación obligatoria antes de cada investigación sin cobertura (§6.4): sin la casilla no se avanza. */
export function ConsentDialog({ open, onConfirm, onCancel }: { open: boolean; onConfirm(ack: true): void; onCancel(): void }) {
  const t = useT();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState(0);
  const id = useId();
  const box = useRef<HTMLButtonElement>(null);
  // La página nativa se dibuja sobre la UI: mientras el diálogo está abierto se sustituye por su captura.
  useUnderlay(open);
  useEffect(() => {
    if (open) {
      setChecked(false);
      setError(0);
      box.current?.focus();
    }
  }, [open]);
  if (!open) return null;
  const confirm = () => (checked ? onConfirm(true) : setError((n) => n + 1));
  // En un portal: el panel lateral tiene transformaciones (animación de entrada) que atraparían un `position: fixed`.
  return createPortal(
    <div className="np-consent-backdrop np-fade" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="np-consent np-modal-in" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          e.stopPropagation(); // sin esto el Escape también cerraría el panel (los eventos suben por el portal)
          onCancel();
        }}>
        <div className="np-consent-body">
          <span className="np-consent-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 4l9 16H3z" />
              <path d="M12 10v4M12 17v.5" />
            </svg>
          </span>
          <h2 id={`${id}-t`}>{t('noCoverage.consent.title')}</h2>
          <p>{t('noCoverage.consent.body')}</p>
          <ul>
            {(['bullet1', 'bullet2', 'bullet3'] as const).map((k) => (
              <li key={k}>{emphasize(t(`noCoverage.consent.${k}`))}</li>
            ))}
          </ul>
          <div key={error} className={`np-consent-check${error ? ' np-consent-check--error' : ''}`}>
            <button ref={box} type="button" role="checkbox" aria-checked={checked} aria-describedby={error ? `${id}-e` : undefined} onClick={() => (setChecked(!checked), setError(0))}>
              <span className="np-consent-box" aria-hidden="true">{checked ? '✓' : ''}</span>
              <span>{t('noCoverage.consent.checkbox')}</span>
            </button>
            {error ? <p id={`${id}-e`} role="alert" className="np-consent-error np-rise">{t('noCoverage.consent.error')}</p> : null}
          </div>
        </div>
        <div className="np-consent-actions">
          <button type="button" className="np-consent-cancel" onClick={onCancel}>{t('noCoverage.consent.cancel')}</button>
          <button type="button" className="np-consent-confirm" onClick={confirm}>{t('noCoverage.consent.confirm')}</button>
        </div>
      </div>
    </div>,
    document.querySelector('.np-root') ?? document.body,
  );
}
