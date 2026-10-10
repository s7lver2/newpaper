import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { startTour } from './tour/Tour';

export function HelpSection() {
  const t = useT();
  return (
    <section className="np-settings-section np-stagger np-sys-sec" aria-labelledby="np-set-help">
      <div>
        <h2 id="np-set-help" className="np-settings-h2">{t('settings.help.title')}</h2>
        <p className="np-settings-hint">{t('settings.help.description')}</p>
      </div>
      <div className="np-settings-card np-switch-card">
        <div className="np-set-row">
          <div className="np-set-text">
            <span className="np-set-name">{t('tour.repeat')}</span>
            <span className="np-set-desc">{t('tour.repeatHint')}</span>
          </div>
          <div className="np-set-actions">
            <Button className="np-set-btn" onClick={startTour}>{t('tour.repeat')}</Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Segunda línea de la entrada "Ayuda" en la barra lateral de Ajustes. */
export function HelpSummary() {
  const t = useT();
  return <>{t('settings.help.description')}</>;
}
