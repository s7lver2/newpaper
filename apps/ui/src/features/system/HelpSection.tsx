import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { startTour } from './tour/Tour';

export function HelpSection() {
  const t = useT();
  return (
    <div className="np-updates">
      <p>{t('tour.repeatHint')}</p>
      <Button onClick={startTour}>{t('tour.repeat')}</Button>
    </div>
  );
}
