// Genera las imágenes BMP de 24 bits del instalador con la paleta papel/tinta (sin dependencias).
import { writeFileSync } from 'node:fs';

const PAPER = [0xf6, 0xf4, 0xef];
const INK = [0x17, 0x17, 0x1a];
const ACCENT = [0x23, 0x40, 0xb8];

function bmp(w, h, pixel) {
  const row = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + row * h;
  const b = Buffer.alloc(size);
  b.write('BM', 0);
  b.writeUInt32LE(size, 2);
  b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18);
  b.writeInt32LE(h, 22);
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28);
  b.writeUInt32LE(row * h, 34);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, bl] = pixel(x, h - 1 - y);
      const o = 54 + y * row + x * 3;
      b[o] = bl;
      b[o + 1] = g;
      b[o + 2] = r;
    }
  }
  return b;
}

// Cabecera 150×57: papel con una línea de tinta abajo y un bloque de acento (la "n" de la marca).
writeFileSync('src-tauri/nsis/header.bmp', bmp(150, 57, (x, y) => (y >= 54 ? INK : x >= 118 && x < 140 && y >= 14 && y < 44 ? ACCENT : PAPER)));
// Lateral 164×314: columna de tinta con filetes de periódico sobre papel.
writeFileSync('src-tauri/nsis/sidebar.bmp', bmp(164, 314, (x, y) => (x < 12 ? INK : y % 24 === 0 && x > 24 && x < 140 ? INK : y > 40 && y < 70 && x > 24 && x < 60 ? ACCENT : PAPER)));
console.log('installer art written');
