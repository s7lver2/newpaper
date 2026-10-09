import { useId } from 'react';

const CELLS = Array.from({ length: 16 }, (_, i) => i);
const PINS = Array.from({ length: 26 }, (_, i) => i);

/** El módulo entero; se dibuja dos veces (una por mitad), así las animaciones CSS corren en ambas. */
function Module() {
  return (
    <g>
      <rect x="20" y="34" width="280" height="88" rx="8" className="np-ram-pcb" />
      <rect x="30" y="44" width="52" height="38" rx="4" className="np-ram-chip" />
      <rect x="92" y="44" width="52" height="38" rx="4" className="np-ram-chip" />
      <rect x="176" y="44" width="52" height="38" rx="4" className="np-ram-chip" />
      <rect x="238" y="44" width="52" height="38" rx="4" className="np-ram-chip" />
      {CELLS.map((i) => (
        <rect key={i} x={36 + i * 16.4} y="94" width="12" height="9" rx="2" className="np-ram-cell" style={{ ['--i' as string]: i }} />
      ))}
      <path d="M146 122 v-8 a8 8 0 0 1 16 0 v8" className="np-ram-notch" />
      {PINS.map((i) => (
        <rect key={i} x={26 + i * 10.6 + (i > 12 ? 10 : 0)} y="122" width="6" height="16" className="np-ram-pin" />
      ))}
    </g>
  );
}

/**
 * Módulo de memoria RAM que se llena, tiembla y se parte (aviso de consumo excesivo de recursos).
 * Solo dibuja: los textos, los botones y la lógica son de quien lo usa (web hoy, móvil después).
 *
 *   animate = true   se llena (2,2 s), tiembla, hace crack y las dos mitades se separan; se queda partido
 *   animate = false  (movimiento reducido) ya agrietado y partido, sin animación
 */
export function RamCrack({ animate = true, className, label }: { animate?: boolean; className?: string; label?: string }) {
  const uid = useId().replace(/:/g, '');
  const left = `${uid}-l`;
  const right = `${uid}-r`;
  // Línea de rotura (de arriba a abajo del módulo). La mitad derecha solapa 1,2 px para que no se vea la costura.
  const crack = 'M168 34 L159 56 L175 72 L157 92 L171 108 L163 136';
  return (
    <svg className={`np-ram ${className ?? ''}`} data-animate={animate ? 'true' : 'false'} viewBox="0 0 320 170" role="img" aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <clipPath id={left}><path d="M0 0 H168 L159 56 L175 72 L157 92 L171 108 L163 136 L163 170 H0 Z" /></clipPath>
        <clipPath id={right}><path d="M166.8 0 H320 V170 H161.8 L161.8 136 L169.8 108 L155.8 92 L173.8 72 L157.8 56 Z" /></clipPath>
      </defs>
      <g className="np-ram-half np-ram-half--l" clipPath={`url(#${left})`}>
        <Module />
      </g>
      <g className="np-ram-half np-ram-half--r" clipPath={`url(#${right})`}>
        <Module />
      </g>
      <path d={crack} className="np-ram-crack" pathLength={100} />
    </svg>
  );
}
