import { useT } from '@newpaper/i18n/react';

/** La n. del icono (design/mockups/icons/android/ic_launcher_foreground.svg) dibujada con trazo: tinta, n, rombo tripartito. */
export function Splash({ short, leaving }: { short: boolean; leaving: boolean }) {
  const t = useT();
  return (
    <div className={`m-splash${short ? ' short' : ''}${leaving ? ' out' : ''}`} role="status" aria-label={t('mobile.splash.label')}>
      <svg className="m-splash-mark" viewBox="0 0 108 108" aria-hidden="true">
        <rect className="tile" x="8" y="8" width="92" height="92" rx="22" />
        <g transform="translate(0 0)">
          <path className="stroke" pathLength={1} d="M33 40.5V71" strokeWidth={7.5} />
          <path className="stroke" pathLength={1} d="M33 54C33 45 39 40 46.5 40 54 40 58 44.5 58 51.5V71" strokeWidth={6} />
          <path className="stroke" pathLength={1} d="M26.5 71H39.5M51.5 71H64.5" strokeWidth={3} />
        </g>
        <polygon points="67.5,66 71.83,61.67 71.83,70.33" fill="#C2412F" />
        <polygon points="71.83,61.67 76.17,66 71.83,70.33" fill="#8D8981" />
        <polygon points="76.17,66 80.5,61.67 80.5,70.33" fill="#2F5BD3" />
      </svg>
      <p className="m-splash-word">newpaper</p>
      <p className="m-splash-tag">{t('mobile.splash.tagline')}</p>
      <div className="m-splash-bar" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
