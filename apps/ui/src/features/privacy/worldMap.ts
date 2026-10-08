/**
 * Dot-matrix world map used by the Tor popup and Settings.
 *
 * Geometry copied from the design mockups (`Main`, `Ajustes`, `Movil-Tor`): a 72 x 28 grid where each cell is 5 degrees,
 * columns span lon -180..180 and rows span lat 80..-60. Every row lists the [first, last] columns that are land.
 */
export const GRID_COLS = 72;
export const GRID_ROWS = 28;
/** Size of the unscaled map layer in the popup (square cells: 1000 / 72 == 389 / 28). */
export const MAP_W = 1000;
export const MAP_H = 389;

export const LAND_ROWS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[16, 22], [25, 32], [39, 39], [48, 52]],
  [[10, 22], [25, 32], [46, 62]],
  [[4, 12], [14, 22], [25, 31], [40, 44], [46, 70]],
  [[2, 9], [10, 20], [22, 23], [26, 30], [32, 33], [38, 71]],
  [[4, 8], [9, 23], [27, 27], [37, 70]],
  [[10, 24], [34, 36], [38, 68]],
  [[11, 25], [35, 35], [36, 64]],
  [[11, 23], [36, 63], [64, 64]],
  [[11, 21], [34, 36], [38, 60], [64, 64]],
  [[12, 20], [35, 42], [43, 60], [62, 63]],
  [[13, 19], [34, 48], [49, 60]],
  [[14, 16], [20, 20], [33, 43], [44, 47], [50, 60]],
  [[15, 18], [20, 21], [32, 43], [44, 47], [50, 53], [55, 58], [60, 60]],
  [[18, 19], [32, 45], [51, 52], [55, 57], [60, 60]],
  [[19, 24], [33, 46], [51, 51], [55, 57], [61, 61]],
  [[20, 26], [34, 45], [56, 59]],
  [[20, 26], [38, 44], [56, 60]],
  [[20, 29], [38, 44], [57, 66]],
  [[21, 28], [38, 44], [60, 61], [62, 65]],
  [[21, 28], [38, 44], [45, 46], [61, 65]],
  [[22, 28], [38, 43], [45, 46], [59, 66]],
  [[22, 26], [39, 42], [58, 66]],
  [[22, 25], [39, 42], [59, 66]],
  [[22, 24], [39, 40], [59, 62], [64, 66]],
  [[21, 23], [65, 65], [70, 71]],
  [[21, 22], [69, 70]],
  [[21, 22]],
  [[22, 23]],
];

/** Land cells as percentages of the map box (left, top). */
export const LAND_DOTS: ReadonlyArray<{ left: number; top: number }> = LAND_ROWS.flatMap((row, r) =>
  row.flatMap(([from, to]) =>
    Array.from({ length: to - from + 1 }, (_, i) => ({
      left: ((from + i + 0.5) / GRID_COLS) * 100,
      top: ((r + 0.5) / GRID_ROWS) * 100,
    })),
  ),
);

/** Position of a coordinate as a fraction (0..1) of the map box. */
export const fracX = (lon: number): number => ((lon + 180) / 5 + 0.5) / GRID_COLS;
export const fracY = (lat: number): number => ((80 - lat) / 5 + 0.5) / GRID_ROWS;
