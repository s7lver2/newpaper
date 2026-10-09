import { gridFor, TILE_GRIDS } from './tileGrids';

const S = 40;

export function TileMap({ regions, format, label, regionName }: { regions: { code: string; value: number }[]; format(n: number): string; label: string; regionName(code: string): string }) {
  const id = gridFor(regions.map((r) => r.code));
  if (!id) return null;
  const grid = TILE_GRIDS[id] as Record<string, [number, number]>;
  const vals = regions.map((r) => r.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const cols = Math.max(...Object.values(grid).map((p) => p[0])) + 1;
  const rows = Math.max(...Object.values(grid).map((p) => p[1])) + 1;
  const byCode = new Map(regions.map((r) => [r.code.toUpperCase(), r.value]));
  return (
    <svg viewBox={`0 0 ${cols * S} ${rows * S}`} className="np-svg np-tilemap" role="img" aria-label={label}>
      {Object.entries(grid).map(([code, [c, r]]) => {
        const v = byCode.get(code);
        const pct = v === undefined ? 0 : hi === lo ? 70 : 15 + ((v - lo) / (hi - lo)) * 75;
        return (
          <g key={code}>
            <rect x={c * S + 2} y={r * S + 2} width={S - 4} height={S - 4} rx={5} style={{ fill: v === undefined ? 'var(--np-soft)' : `color-mix(in srgb, var(--np-accent) ${pct}%, var(--np-card))` }}>
              <title>{v === undefined ? regionName(code) : `${regionName(code)}: ${format(v)}`}</title>
            </rect>
            <text x={c * S + S / 2} y={r * S + S / 2 + 4} textAnchor="middle" className="np-tile-code">{code.slice(-2)}</text>
          </g>
        );
      })}
    </svg>
  );
}
