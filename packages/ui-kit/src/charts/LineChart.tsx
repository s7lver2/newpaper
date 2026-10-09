import { linear, niceTicks } from './scale';

const W = 480;
const H = 220;
const PAD = { l: 40, r: 12, t: 8, b: 28 };

export function LineChart({ points, format, label }: { points: { x: string; y: number; provisional?: boolean }[]; format(n: number): string; label: string }) {
  const ys = points.map((p) => p.y);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const y = linear(ticks[0]!, ticks.at(-1)!, H - PAD.b, PAD.t);
  const x = linear(0, Math.max(1, points.length - 1), PAD.l, W - PAD.r);
  const firm = points.filter((p) => !p.provisional);
  const path = (ps: typeof points, offset: number) => ps.map((p, i) => `${i ? 'L' : 'M'}${x(i + offset)},${y(p.y)}`).join(' ');
  const provStart = Math.max(0, firm.length - 1);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="np-svg" role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="np-grid" />
          <text x={PAD.l - 4} y={y(t) + 3} className="np-tick" textAnchor="end">{format(t)}</text>
        </g>
      ))}
      <path d={path(firm, 0)} className="np-line np-draw" />
      {firm.length < points.length ? <path d={path(points.slice(provStart), provStart)} className="np-line np-line--prov" /> : null}
      {points.map((p, i) => (
        <g key={p.x}>
          <circle cx={x(i)} cy={y(p.y)} r={3} className="np-dot">
            <title>{`${p.x}: ${format(p.y)}`}</title>
          </circle>
          <text x={x(i)} y={H - 10} className="np-tick" textAnchor="middle">{p.x}</text>
        </g>
      ))}
    </svg>
  );
}
