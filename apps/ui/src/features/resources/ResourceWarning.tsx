import { useI18n } from '@newpaper/i18n/react';
import { Button, RamCrack, useReducedMotion } from '@newpaper/ui-kit';
import { useEffect, useId, useRef, useState } from 'react';
import { commands } from '../../ipc/commands';
import { onResources, type ResourceEvent } from '../../ipc/events';
import { useUnderlay } from '../../shell/underlay';

/** GiB con un decimal: 2.4 */
export const gib = (mib: number): string => (mib / 1024).toFixed(1);

/**
 * Aviso de consumo excesivo de recursos. El contrato (evento `app://resources`, comandos
 * `resources_*`, textos `resources.*`) y el dibujo (`RamCrack`) son reutilizables en móvil.
 * No cierra nada sin una acción explícita.
 */
export function ResourceWarning() {
  const { t, locale } = useI18n();
  const reduced = useReducedMotion();
  const [ev, setEv] = useState<ResourceEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const later = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useUnderlay(ev !== null);

  useEffect(() => {
    const off = onResources((e) => setEv(e.level === 'warn' ? e : null));
    return () => void off.then((f) => f());
  }, []);

  const snooze = () => {
    setEv(null);
    void commands.resourcesSnooze();
  };

  useEffect(() => {
    if (!ev) return;
    later.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') snooze();
      if (e.key !== 'Tab') return;
      const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev !== null]);

  if (!ev) return null;
  const n = ev.closable.length;
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const closeBackground = async () => {
    setBusy(true);
    try {
      await commands.resourcesCloseBackground();
    } finally {
      setBusy(false);
      setEv(null);
    }
  };
  return (
    <div className="np-dialog-scrim">
      <div ref={dialog} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} className="np-dialog np-pop np-resource">
        <div className="np-resource-art">
          <RamCrack animate={!reduced} />
        </div>
        <h2 id={titleId}>{t('resources.title')}</h2>
        <p id={bodyId} className="np-notice np-notice--warn">
          {t('resources.body', { used: num.format(ev.usedMib / 1024), limit: num.format(ev.limitMib / 1024) })}
        </p>
        <div className="np-dialog-actions np-resource-actions">
          {n > 0 ? (
            <Button variant="primary" disabled={busy} onClick={closeBackground}>
              {t('resources.closeBackground', { count: n })}
            </Button>
          ) : null}
          <Button variant="danger" disabled={busy} onClick={() => void commands.appExit()}>{t('resources.quit')}</Button>
          <Button ref={later} disabled={busy} onClick={snooze}>{t('resources.later')}</Button>
        </div>
      </div>
    </div>
  );
}
