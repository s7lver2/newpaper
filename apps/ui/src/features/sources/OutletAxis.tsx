import type { OutletLean } from '../../ipc/types';

/** Eje 0–100 con un punto por medio y su franja de incertidumbre (decorativo: los valores están en la lista). */
export function OutletAxis({ outlets }: { outlets: OutletLean[] }) {
  const placed = outlets.filter((o) => o.effective !== null);
  return (
    <svg className="np-axis" viewBox="0 0 400 60" aria-hidden="true">
      <line x1="0" y1="30" x2="400" y2="30" stroke="var(--np-line3)" />
      {placed.map((o, i) => {
        const x = (o.effective! / 100) * 400;
        const u = ((o.effectiveUncertainty ?? 0) / 100) * 400;
        const y = 14 + (i % 4) * 10;
        return (
          <g key={o.outletId}>
            {u > 0 ? <rect className="np-axis-band" x={x - u} y={y - 3} width={u * 2} height={6} rx={3} /> : null}
            <circle className="np-axis-dot" data-override={o.overrideLean !== null} cx={x} cy={y} r={4} />
          </g>
        );
      })}
    </svg>
  );
}
