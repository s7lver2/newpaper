import { linear, niceTicks } from './scale';

const W = 320;
const H = 180;
const PAD = { l: 40, r: 8, t: 8, b: 28 };

export function BarChart({ points, format, label }: { points: { x: string; y: number; provisional?: boolean }[]; format(n: number): string; label: string }) {
  const ticks = niceTicks(Math.min(0, ...points.map((p) => p.y)), Math.max(0, ...points.map((p) => p.y)));
  const y = linear(ticks[0]!, ticks.at(-1)!, H - PAD.b, PAD.t);
  const bw = (W - PAD.l - PAD.r) / points.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="np-svg" role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="np-grid" />
          <text x={PAD.l - 4} y={y(t) + 3} className="np-tick" textAnchor="end">{format(t)}</text>
        </g>
      ))}
      {points.map((p, i) => (
        <g key={p.x} className="np-grow">
          <rect x={PAD.l + i * bw + bw * 0.15} width={bw * 0.7} y={Math.min(y(p.y), y(0))} height={Math.abs(y(0) - y(p.y))} className={p.provisional ? 'np-bar np-bar--prov' : 'np-bar'}>
            <title>{`${p.x}: ${format(p.y)}`}</title>
          </rect>
          <text x={PAD.l + i * bw + bw / 2} y={H - 10} className="np-tick" textAnchor="middle">{p.x}</text>
        </g>
      ))}
    </svg>
  );
}
