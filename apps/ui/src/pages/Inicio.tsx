import { useT } from '@newpaper/i18n/react';
import type { InternalPageProps } from '../shell/registry';

/** Inicio provisional: el subproyecto 5 registra la nueva pestaña completa con el mismo nombre. */
export function Inicio({ url }: InternalPageProps) {
  const t = useT();
  const q = url.query.get('q');
  return (
    <div className="np-inicio">
      <h1 className="np-inicio-title">{q ? t('shell.inicio.results', { query: q }) : t('shell.inicio.title')}</h1>
      <p className="np-inicio-sub">{t('shell.inicio.soon')}</p>
    </div>
  );
}
