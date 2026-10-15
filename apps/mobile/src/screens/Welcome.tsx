import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useState } from 'react';
import { ipc } from '../ipc';
import { go } from '../router';

const STEPS = 2;

/** Primera vez: qué es y emparejar con el PC (o más tarde). Sin Tor en esta versión: la conexión es directa. */
export function Welcome() {
  const t = useT();
  const [step, setStep] = useState(0);
  const finish = async (next: 'hoy' | 'emparejar') => {
    await ipc.settingsSet('device.mobileWelcomeDone', true).catch(() => {});
    go(next);
  };
  return (
    <section className="m-welcome" aria-live="polite">
      <p className="np-mono np-muted">{t('mobile.welcome.count', { n: step + 1, total: STEPS })}</p>
      {step === 0 ? (
        <>
          <h1 className="m-title">{t('mobile.welcome.title')}</h1>
          <p>{t('mobile.welcome.body')}</p>
          <Button variant="primary" onClick={() => setStep(1)}>{t('mobile.welcome.next')}</Button>
        </>
      ) : null}
      {step === 1 ? (
        <>
          <h1 className="m-title">{t('mobile.welcome.pairTitle')}</h1>
          <p>{t('mobile.welcome.pairBody')}</p>
          <div className="m-row">
            <Button onClick={() => void finish('hoy')}>{t('mobile.welcome.pairLater')}</Button>
            <Button variant="primary" onClick={() => void finish('emparejar')}>{t('mobile.welcome.pairNow')}</Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
