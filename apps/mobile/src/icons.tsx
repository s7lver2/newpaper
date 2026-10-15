import type { ReactNode } from 'react';

/** Iconos de trazo 24 px (trazo 1,75, extremos y uniones redondos). Ver design/mockups/MOVIL-DISENO.md, sección Barra de pestañas. */
function Stroke({ children, className, fill }: { children: ReactNode; className?: string; fill?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} focusable="false">
      {fill ? null : null}
      {children}
    </svg>
  );
}

export function IconToday() {
  return (
    <Stroke>
      <path className="fill" stroke="none" d="M5.5 4h13A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5v-13A1.5 1.5 0 015.5 4z" />
      <path d="M5.5 4h13A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 18.5v-13A1.5 1.5 0 015.5 4z" />
      <path d="M8 9h8M8 12.5h8M8 16h4.5" />
    </Stroke>
  );
}

export function IconReading() {
  return (
    <Stroke>
      <path className="fill" stroke="none" d="M12 7c-1.8-1.5-4.5-2-7.5-1.5V18c3-.4 5.7.1 7.5 1.5 1.8-1.4 4.5-1.9 7.5-1.5V5.5C16.5 5 13.8 5.5 12 7z" />
      <path d="M12 7c-1.8-1.5-4.5-2-7.5-1.5V18c3-.4 5.7.1 7.5 1.5 1.8-1.4 4.5-1.9 7.5-1.5V5.5C16.5 5 13.8 5.5 12 7z" />
      <path d="M12 7v12.5" />
    </Stroke>
  );
}

export function IconAgent() {
  return (
    <Stroke>
      <path className="fill" stroke="none" d="M6 4.5h12a2 2 0 012 2V15a2 2 0 01-2 2h-6.5L7 20.5V17H6a2 2 0 01-2-2V6.5a2 2 0 012-2z" />
      <path d="M6 4.5h12a2 2 0 012 2V15a2 2 0 01-2 2h-6.5L7 20.5V17H6a2 2 0 01-2-2V6.5a2 2 0 012-2z" />
      <path d="M12 7.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
    </Stroke>
  );
}

export function IconSettings() {
  return (
    <Stroke>
      <path className="fill" stroke="none" d="M4 8h8M17 8h3M4 16h3M12 16h8" />
      <path d="M4 8h8M17 8h3M4 16h3M12 16h8" />
      <circle cx="14.5" cy="8" r="2.5" />
      <circle cx="9.5" cy="16" r="2.5" />
    </Stroke>
  );
}

/** Lente de sesgo: ojo abierto (activo) o cerrado (inactivo). La morfa la hace mobile.css con `.m-lens`. */
export function IconLens() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="m-lens-ico">
      <path className="lid" d="M2.5 12C5 7.5 8.3 5.5 12 5.5C15.7 5.5 19 7.5 21.5 12C19 16.5 15.7 18.5 12 18.5C8.3 18.5 5 16.5 2.5 12Z" />
      <circle className="pupil" cx="12" cy="12" r="2.7" />
      <path className="lash" d="M6 15.2l-1 2.6M12 16.7v3M18 15.2l1 2.6" />
    </svg>
  );
}

export function IconBack() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="m-chev">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.2-4.2" />
    </svg>
  );
}

export function IconRefresh() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12a8 8 0 11-2.3-5.6" />
      <path d="M20 4v4.5h-4.5" />
    </svg>
  );
}

export function IconScan() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8V5.5A1.5 1.5 0 015.5 4H8M16 4h2.5A1.5 1.5 0 0120 5.5V8M20 16v2.5a1.5 1.5 0 01-1.5 1.5H16M8 20H5.5A1.5 1.5 0 014 18.5V16" />
      <path d="M7.5 12h9" />
    </svg>
  );
}

/** Icono de fila (20 px) por nombre. Se usa dentro de `.m-ico`. */
export function RowIcon({ name }: { name: 'ai' | 'pipe' | 'net' | 'block' | 'src' | 'offline' | 'device' | 'history' | 'palette' | 'info' | 'key' | 'trash' | 'warn' | 'globe' | 'lang' }) {
  const d: Record<typeof name, string> = {
    ai: 'M12 4l1.8 4.7L18.5 10.5l-4.7 1.8L12 17l-1.8-4.7L5.5 10.5l4.7-1.8z',
    pipe: 'M5 6h14M5 12h9M5 18h5',
    net: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18',
    block: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z',
    src: 'M4 7h16M4 12h10M4 17h7',
    offline: 'M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3M4 4l16 16',
    device: 'M4 5h16v11H4zM9 20h6M12 16v4',
    history: 'M4 12a8 8 0 108-8 8 8 0 00-6 2.7M4 4v4h4M12 8v4l3 2',
    palette: 'M12 3a9 9 0 000 18c1.2 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.7 1.8-1.7H17a4 4 0 004-4C21 6.5 17 3 12 3z',
    info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v5M12 8h.01',
    key: 'M8 14a4 4 0 110-.1M11 12h10M18 12v3M15 12v2',
    trash: 'M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12',
    warn: 'M12 4l9 16H3zM12 10v4M12 17h.01',
    globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18',
    lang: 'M4 5h9M8 5c0 4-2 7-4 8M6 9c1 2 3 4 6 5M13 19l4-9 4 9M14.5 16h5',
  };
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d[name]} />
    </svg>
  );
}
