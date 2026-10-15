import { useI18n } from '@newpaper/i18n/react';
import { useBackClose } from './router';

/** Hoja de confirmación para acciones que no se pueden deshacer. Atrás la cierra. */
export function ConfirmSheet({ title, body, confirm, onConfirm, onCancel, busy }: { title: string; body: string; confirm: string; onConfirm(): void; onCancel(): void; busy?: boolean }) {
  const { t } = useI18n();
  const dismiss = useBackClose(true, onCancel);
  return (
    <>
      <div className="m-scrim" onClick={() => dismiss()} aria-hidden="true" />
      <div className="m-sheet" role="alertdialog" aria-modal="true" aria-label={title}>
        <div className="m-grab" />
        <h2 className="m-title-sm">{title}</h2>
        <p className="m-muted" style={{ margin: '8px 0 20px' }}>{body}</p>
        <div className="m-btn-row" style={{ padding: 0 }}>
          <button type="button" className="m-btn sec" onClick={() => dismiss()}>{t('mobile.settings.confirmCancel')}</button>
          <button type="button" className="m-btn danger" disabled={busy} onClick={onConfirm}>{confirm}</button>
        </div>
      </div>
    </>
  );
}

/** Interruptor accesible (role switch) con el estilo `.m-switch`. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="m-switch" onClick={() => onChange(!checked)} />;
}

/** Aviso breve al pie (snackbar). */
export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return <div className="m-toast" role="status">{text}</div>;
}
