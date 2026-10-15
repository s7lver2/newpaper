import { useI18n } from '@newpaper/i18n/react';
import { IconBack } from '../icons';
import { back } from '../router';

/** Barra superior unificada: atrás (48 px) y título en serif. */
export function Bar({ title, sub, onBack }: { title: string; sub?: string; onBack?: () => void }) {
  const { t } = useI18n();
  return (
    <header className="m-appbar">
      <button type="button" className="m-back" aria-label={t('mobile.nav.back')} onClick={() => (onBack ? onBack() : back())}>
        <IconBack />
      </button>
      <h1 className="m-bar-title" style={{ margin: 0 }}>
        {title}
        {sub ? <span className="m-bar-sub">{sub}</span> : null}
      </h1>
    </header>
  );
}
