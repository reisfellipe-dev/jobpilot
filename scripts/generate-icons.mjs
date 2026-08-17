/**
 * Gera os ícones PNG do PWA sem depender de biblioteca de imagem.
 * Escreve PNG RGBA na mão (IHDR + IDAT com zlib + IEND).
 *
 * Uso: npm run icons
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUTPUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BACKGROUND = [0x6366f1 >> 16, (0x6366f1 >> 8) & 0xff, 0x6366f1 & 0xff];
const FOREGROUND = [255, 255, 255];

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Cada scanline recebe o byte de filtro 0 (None).
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Desenha o "J" do JobPilot com retângulos simples. */
function drawIcon(size, { rounded }) {
  const pixels = Buffer.alloc(size * size * 4);
  const radius = rounded ? size * 0.22 : 0;

  const bars = [
    // haste vertical do J
    { x0: 0.545, x1: 0.655, y0: 0.24, y1: 0.63 },
    // curva inferior (aproximada)
    { x0: 0.335, x1: 0.655, y0: 0.63, y1: 0.74 },
    { x0: 0.335, x1: 0.445, y0: 0.53, y1: 0.7 },
    // barra superior
    { x0: 0.42, x1: 0.72, y0: 0.24, y1: 0.34 },
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;

      let alpha = 255;
      if (rounded) {
        // Cantos arredondados por distância ao centro do canto.
        const cx = Math.min(x, size - 1 - x);
        const cy = Math.min(y, size - 1 - y);
        if (cx < radius && cy < radius) {
          const distance = Math.hypot(radius - cx, radius - cy);
          if (distance > radius) alpha = 0;
        }
      }

      let color = BACKGROUND;
      const fx = x / size;
      const fy = y / size;
      for (const bar of bars) {
        if (fx >= bar.x0 && fx <= bar.x1 && fy >= bar.y0 && fy <= bar.y1) {
          color = FOREGROUND;
          break;
        }
      }

      pixels[index] = color[0];
      pixels[index + 1] = color[1];
      pixels[index + 2] = color[2];
      pixels[index + 3] = alpha;
    }
  }

  return encodePng(size, size, pixels);
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="14" fill="#6366f1"/>
  <path d="M27 15h19v6h-6v20a10 10 0 0 1-10 10h-9v-6h9a4 4 0 0 0 4-4V21h-7z" fill="#ffffff"/>
</svg>
`;

mkdirSync(OUTPUT_DIR, { recursive: true });

writeFileSync(resolve(OUTPUT_DIR, 'icon-192.png'), drawIcon(192, { rounded: true }));
writeFileSync(resolve(OUTPUT_DIR, 'icon-512.png'), drawIcon(512, { rounded: true }));
// Maskable precisa de sangria total: o sistema aplica a própria máscara.
writeFileSync(resolve(OUTPUT_DIR, 'icon-maskable-512.png'), drawIcon(512, { rounded: false }));
writeFileSync(resolve(OUTPUT_DIR, 'apple-touch-icon.png'), drawIcon(180, { rounded: false }));
writeFileSync(resolve(OUTPUT_DIR, 'icon.svg'), SVG);

console.log(`Ícones gerados em ${OUTPUT_DIR}`);
