import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { commands } from '../ipc/commands';
import type { TabInfo } from '../ipc/types';

/** Line drawing from Errores.dc.html (document with a cut cable); the strokes draw themselves in. */
const Art = () => (
  <svg className="np-fallback-art" width="260" height="220" viewBox="0 0 260 220" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="40" y="40" width="130" height="150" rx="6" pathLength="1" />
    <line x1="58" y1="66" x2="152" y2="66" pathLength="1" style={{ animationDelay: '.3s' }} />
    <line x1="58" y1="88" x2="130" y2="88" pathLength="1" style={{ animationDelay: '.4s' }} />
    <line x1="58" y1="106" x2="146" y2="106" pathLength="1" style={{ animationDelay: '.5s' }} />
    <line x1="58" y1="124" x2="120" y2="124" pathLength="1" style={{ animationDelay: '.6s' }} />
    <path d="M170 120 C 200 120, 200 150, 214 150" pathLength="1" style={{ animationDelay: '.7s' }} />
    <path d="M232 150 C 240 150, 246 140, 252 140" pathLength="1" style={{ animationDelay: '.9s' }} />
    <path d="M216 142 l6 -8 M224 160 l6 -8" stroke="var(--np-bad)" pathLength="1" style={{ animationDelay: '1.1s' }} />
  </svg>
);

export function FallbackError({ tab }: { tab: TabInfo }) {
  const t = useT();
  const code = tab.failure?.httpStatus ?? tab.failure?.webErrorStatus ?? 0;
  return (
    <div className="np-surface np-fallback" role="alert">
      <Art />
      <div className="np-fallback-text">
        <p className="np-kicker np-fallback-kicker">{t('shell.surface.kicker')}</p>
        <h1 className="np-fallback-title">{t('shell.surface.errorTitle')}</h1>
        <p className="np-fallback-lead">{t('shell.surface.errorDetail', { code })}</p>
        <Button variant="primary" onClick={() => commands.tabReload(tab.id)}>
          {t('common.retry')}
        </Button>
      </div>
    </div>
  );
}

export function FallbackCrash({ tab }: { tab: TabInfo }) {
  const t = useT();
  return (
    <div className="np-surface np-fallback" role="alert">
      <Art />
      <div className="np-fallback-text">
        <p className="np-kicker np-fallback-kicker">{t('shell.surface.kicker')}</p>
        <h1 className="np-fallback-title">{t('shell.surface.crashTitle')}</h1>
        <Button variant="primary" onClick={() => commands.tabReload(tab.id)}>
          {t('shell.surface.crashReload')}
        </Button>
      </div>
    </div>
  );
}
