import { useT } from '@newpaper/i18n/react';

/** "Tú ── Guardia ── Medio ── Salida · XX". Arti does not expose the middle hops' countries, so only the exit is named. */
export function TorRoute({ country, className }: { country: string; className?: string }) {
  const t = useT();
  const hops = [
    { key: 'you', label: t('privacy.tor.routeYou'), exit: false },
    { key: 'guard', label: t('privacy.tor.routeGuard'), exit: false },
    { key: 'middle', label: t('privacy.tor.routeMiddle'), exit: false },
    { key: 'exit', label: t('privacy.tor.routeExit', { country }), exit: true },
  ];
  return (
    <div className={['np-route', className].filter(Boolean).join(' ')}>
      {hops.map((h, i) => (
        // The separator travels with the node that follows it, so a line break never leaves a dangling dash.
        <span key={h.key} className="np-route-part">
          {i > 0 ? <span className="np-route-sep" aria-hidden="true">──</span> : null}
          <span className={h.exit ? 'np-route-node np-route-exit' : 'np-route-node'}>{h.label}</span>
        </span>
      ))}
    </div>
  );
}
