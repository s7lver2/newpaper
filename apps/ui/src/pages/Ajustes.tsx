import { useT } from '@newpaper/i18n/react';
import { useEffect } from 'react';
import { openInternal } from '../shell/navigate';
import { settingsSections, type InternalPageProps } from '../shell/registry';

/** Pitch of the sidebar entries: 58 px tall plus the 4 px gap (the highlight slides by this much per entry). */
const NAV_PITCH = 62;

export function Ajustes({ url }: InternalPageProps) {
  const t = useT();
  const sections = settingsSections();
  const current = sections.find((s) => s.id === url.path[0]) ?? sections[0];
  const currentId = current?.id;
  // En ventanas estrechas la barra lateral es una tira con scroll: la entrada activa se mantiene a la vista.
  useEffect(() => {
    document.querySelector('.np-settings-navitem[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [currentId]);
  if (!current) return null;
  const Section = current.Component;
  const index = Math.max(0, sections.findIndex((s) => s.id === current.id));
  // Un subpaso (p. ej. el asistente de proveedores en ajustes/ia/conectar) ocupa la página entera, como en el mockup Proveedores.
  if (url.path.length > 1) {
    return (
      <div className="np-settings np-settings--full">
        <div className="np-settings-body">
          <Section key={current.id} />
        </div>
      </div>
    );
  }
  return (
    <div className="np-settings">
      <nav aria-label={t('settings.nav')} className="np-settings-nav">
        <h1 className="np-settings-h1">{t('settings.title')}</h1>
        <div className="np-settings-navlist">
          <div className="np-settings-navhi" aria-hidden="true" style={{ transform: `translateY(${index * NAV_PITCH}px)` }} />
          {sections.map((s) => (
            <button key={s.id} type="button" aria-current={s.id === current.id ? 'page' : undefined} className="np-settings-navitem" onClick={() => openInternal('ajustes', [s.id])}>
              <span className="np-settings-navicon" aria-hidden="true">{s.glyph ?? '•'}</span>
              <span className="np-settings-navtext">
                <span className="np-settings-navlabel">{t(s.titleKey)}</span>
                {s.Summary ? <span className="np-settings-navsub"><s.Summary /></span> : null}
              </span>
            </button>
          ))}
        </div>
      </nav>
      <div className="np-settings-body">
        <Section key={current.id} />
      </div>
    </div>
  );
}
