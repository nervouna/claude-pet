const { nativeImage } = require('electron');

const SPRITE = [
  '..########..',
  '..#.####.#..',
  '############',
  '############',
  '..########..',
  '..########..',
  '..#.#..#.#..',
  '..#.#..#.#..',
];

// Pixel Clawd for the menu bar. On macOS it is a template image (black + alpha).
function trayIcon(color = [0, 0, 0]) {
  const scale = 2;
  const cell = 3 * scale / 2; // 1.5pt per sprite pixel
  const size = 18 * scale;
  const buf = Buffer.alloc(size * size * 4);
  const ox = (size - SPRITE[0].length * cell) / 2;
  const oy = (size - SPRITE.length * cell) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const row = SPRITE[Math.floor((y - oy) / cell)];
      const on = row && row[Math.floor((x - ox) / cell)] === '#';
      const i = (y * size + x) * 4;
      // BGRA
      buf[i] = color[2];
      buf[i + 1] = color[1];
      buf[i + 2] = color[0];
      buf[i + 3] = on ? 255 : 0;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: scale });
}

module.exports = { trayIcon };
