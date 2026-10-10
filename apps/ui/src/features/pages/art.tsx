import type { NetErrorKind } from './netError';

/** Ilustraciones de línea de las páginas de sistema (Errores, Crash .dc.html). Decorativas: sin texto. */
const P = { fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 2, stroke: 'currentColor' } as const;

export function OfflineArt() {
  return (
    <svg className="np-draw" width="260" height="220" viewBox="0 0 260 220" aria-hidden="true" {...P}>
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
}

export function TorArt() {
  return (
    <svg className="np-draw" width="260" height="220" viewBox="0 0 260 220" aria-hidden="true" {...P}>
      <g stroke="var(--np-tor, #4A2FB8)">
        <circle cx="90" cy="120" r="56" pathLength="1" />
        <circle cx="90" cy="120" r="38" pathLength="1" style={{ animationDelay: '.2s' }} />
        <circle cx="90" cy="120" r="20" pathLength="1" style={{ animationDelay: '.4s' }} />
        <path d="M90 64 C 90 50, 100 44, 108 40" pathLength="1" style={{ animationDelay: '.6s' }} />
      </g>
      <rect x="176" y="50" width="56" height="140" rx="4" pathLength="1" style={{ animationDelay: '.7s' }} />
      <line x1="176" y1="85" x2="232" y2="85" pathLength="1" style={{ animationDelay: '.9s' }} />
      <line x1="176" y1="120" x2="232" y2="120" pathLength="1" style={{ animationDelay: '1s' }} />
      <line x1="176" y1="155" x2="232" y2="155" pathLength="1" style={{ animationDelay: '1.1s' }} />
      <line x1="204" y1="50" x2="204" y2="85" pathLength="1" style={{ animationDelay: '1.2s' }} />
      <line x1="190" y1="120" x2="190" y2="155" pathLength="1" style={{ animationDelay: '1.3s' }} />
    </svg>
  );
}

export function CertArt() {
  return (
    <svg className="np-draw" width="260" height="220" viewBox="0 0 260 220" aria-hidden="true" {...P}>
      <g stroke="var(--np-bad)">
        <circle cx="130" cy="100" r="62" pathLength="1" />
        <circle cx="130" cy="100" r="48" pathLength="1" style={{ animationDelay: '.2s' }} />
        <path d="M100 150 L84 200 L104 190 L114 206 L122 160" pathLength="1" style={{ animationDelay: '.4s' }} />
        <path d="M160 150 L176 200 L156 190 L146 206 L138 160" pathLength="1" style={{ animationDelay: '.5s' }} />
      </g>
      <path d="M112 70 L136 98 L122 104 L148 132" pathLength="1" style={{ animationDelay: '.9s' }} />
    </svg>
  );
}

export function ClockArt() {
  return (
    <svg width="260" height="220" viewBox="0 0 260 220" aria-hidden="true" {...P}>
      <circle cx="130" cy="110" r="70" stroke="var(--np-line)" strokeWidth="8" />
      <circle cx="130" cy="110" r="70" strokeWidth="8" pathLength="100" strokeDasharray="100" strokeDashoffset="28" transform="rotate(-90 130 110)" />
      <g className="np-sway" style={{ transformOrigin: '130px 110px' }}>
        <line x1="130" y1="110" x2="130" y2="66" />
      </g>
      <circle cx="130" cy="110" r="4" fill="currentColor" />
    </svg>
  );
}

export function CrashArt() {
  return (
    <svg width="300" height="230" viewBox="0 0 300 230" aria-hidden="true" {...P}>
      <rect x="20" y="30" width="260" height="120" rx="14" fill="var(--np-card)" stroke="var(--np-line3)" />
      <g className="np-jam">
        <circle cx="105" cy="90" r="38" fill="var(--np-paper)" />
        <circle cx="105" cy="90" r="6" fill="currentColor" />
        <line x1="105" y1="52" x2="105" y2="128" />
        <line x1="67" y1="90" x2="143" y2="90" />
      </g>
      <g className="np-jam">
        <circle cx="195" cy="90" r="38" fill="var(--np-paper)" />
        <circle cx="195" cy="90" r="6" fill="currentColor" />
        <line x1="168" y1="63" x2="222" y2="117" />
        <line x1="222" y1="63" x2="168" y2="117" />
      </g>
      <path d="M150 128 l-14 18 l22 10 l-26 14 l24 12 l-20 16 l18 12" stroke="var(--np-bad)" />
      <path d="M134 196 l40 -6" stroke="var(--np-bad)" />
    </svg>
  );
}

export function NetArt({ kind }: { kind: NetErrorKind }) {
  if (kind === 'torBlocked') return <TorArt />;
  if (kind === 'cert') return <CertArt />;
  if (kind === 'timeout') return <ClockArt />;
  return <OfflineArt />;
}
