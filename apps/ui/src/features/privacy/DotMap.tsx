import { EXIT_COUNTRIES } from './countries';

/** Mapa decorativo (proyección equirrectangular). La selección accesible es la lista de radios. */
export function DotMap({ active }: { active: string | null }) {
  return (
    <svg className="np-dotmap" viewBox="0 0 360 180" aria-hidden="true">
      <rect x="0" y="0" width="360" height="180" fill="none" />
      {EXIT_COUNTRIES.map((c) => (
        <circle
          key={c.code}
          className="np-dotmap-dot"
          data-active={c.code === active}
          cx={c.lon + 180}
          cy={90 - c.lat}
          r={c.code === active ? 4 : 2.5}
        />
      ))}
    </svg>
  );
}
