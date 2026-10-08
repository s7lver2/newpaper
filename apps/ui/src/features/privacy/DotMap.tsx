import { EXIT_COUNTRIES } from './countries';

type Poly = [number, number][];

/** Contornos muy simplificados (lon, lat) para dibujar un mapa de puntos decorativo. */
const LAND: Poly[] = [
  [[-168, 66], [-140, 70], [-100, 72], [-80, 70], [-62, 60], [-55, 50], [-67, 44], [-76, 35], [-81, 25], [-97, 26], [-105, 22], [-118, 32], [-124, 42], [-125, 50], [-140, 60]],
  [[-105, 22], [-97, 26], [-88, 21], [-83, 10], [-77, 8], [-85, 8], [-95, 15], [-105, 20]],
  [[-55, 60], [-45, 60], [-20, 70], [-20, 82], [-60, 82], [-70, 76]],
  [[-77, 8], [-60, 10], [-50, 0], [-35, -6], [-40, -22], [-58, -38], [-66, -55], [-74, -50], [-72, -20], [-81, -5]],
  [[-10, 36], [-9, 43], [-5, 48], [5, 53], [8, 57], [5, 62], [15, 69], [30, 71], [60, 70], [100, 78], [140, 72], [180, 68], [180, 62], [160, 58], [142, 50], [140, 40], [122, 30], [120, 22], [108, 10], [104, 2], [98, 10], [92, 22], [80, 10], [73, 18], [60, 25], [50, 30], [35, 35], [28, 41], [22, 36], [12, 38], [3, 43]],
  [[35, 30], [43, 13], [52, 16], [59, 22], [56, 26], [48, 30]],
  [[-6, 50], [2, 51], [-2, 58], [-6, 57]],
  [[-24, 64], [-14, 64], [-14, 66], [-24, 66]],
  [[-17, 21], [-10, 35], [10, 37], [32, 31], [43, 12], [51, 12], [40, -5], [40, -16], [33, -26], [20, -35], [12, -18], [9, -1], [-8, 4], [-17, 14]],
  [[114, -22], [130, -12], [142, -11], [153, -26], [147, -38], [135, -34], [115, -34]],
];

function inside(x: number, y: number, poly: Poly): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

const STEP = 4;
const LAND_DOTS: [number, number][] = [];
for (let lat = 84; lat >= -56; lat -= STEP) {
  for (let lon = -178; lon <= 178; lon += STEP) {
    if (LAND.some((p) => inside(lon, lat, p))) LAND_DOTS.push([lon, lat]);
  }
}

/** Mapa de puntos decorativo (proyección equirrectangular). La selección accesible es la lista de radios. */
export function DotMap({ active }: { active: string | null }) {
  return (
    <svg className="np-dotmap" viewBox="0 4 360 150" aria-hidden="true">
      {LAND_DOTS.map(([lon, lat]) => (
        <circle key={`${lon},${lat}`} className="np-dotmap-land" cx={lon + 180} cy={90 - lat} r={1} />
      ))}
      {EXIT_COUNTRIES.map((c) => (
        <circle
          key={c.code}
          className="np-dotmap-dot"
          data-active={c.code === active}
          cx={c.lon + 180}
          cy={90 - c.lat}
          r={c.code === active ? 4.5 : 2.6}
        />
      ))}
    </svg>
  );
}
