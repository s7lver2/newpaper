import { linear } from './scale';

export function RangeChart({ min, max, ranges, format, label }: { min: number; max: number; ranges: { label: string; from: number; to: number }[]; format(n: number): string; label: string }) {
  const W = 480;
  const row = 28;
  const H = ranges.length * row + 24;
  const x = linear(min, max, 150, W - 14);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="np-svg" role="img" aria-label={label}>
      {ranges.map((r, i) => (
        <g key={r.label}>
          <text x={4} y={i * row + 18} className="np-tick">{r.label}</text>
          <rect x={x(r.from) - (x(r.to) - x(r.from) < 14 ? 7 : 0)} y={i * row + 8} width={Math.max(14, x(r.to) - x(r.from))} height={14} rx={7} className="np-bar">
            <title>{`${r.label}: ${format(r.from)} – ${format(r.to)}`}</title>
          </rect>
        </g>
      ))}
      <text x={150} y={H - 4} className="np-tick">{format(min)}</text>
      <text x={W - 14} y={H - 4} className="np-tick" textAnchor="end">{format(max)}</text>
    </svg>
  );
}
