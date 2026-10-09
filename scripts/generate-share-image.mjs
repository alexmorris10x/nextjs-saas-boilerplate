#!/usr/bin/env node
// Deterministic, dependency-free placeholder PNG. Replace for each app's launch.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const width = 1200;
const height = 630;
const pixels = Buffer.alloc(width * height * 3);
const glyphs = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  N: ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
};

function put(x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = (y * width + x) * 3;
  for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = color[channel];
}

function rectangle(x, y, w, h, color, radius = 0) {
  for (let row = y; row < y + h; row++) {
    for (let column = x; column < x + w; column++) {
      const dx = Math.max(x + radius - column, 0, column - (x + w - radius - 1));
      const dy = Math.max(y + radius - row, 0, row - (y + h - radius - 1));
      if (dx * dx + dy * dy <= radius * radius) put(column, row, color);
    }
  }
}

function circle(x, y, radius, color) {
  for (let row = y - radius; row <= y + radius; row++) {
    for (let column = x - radius; column <= x + radius; column++) {
      if ((column - x) ** 2 + (row - y) ** 2 <= radius ** 2) put(column, row, color);
    }
  }
}

function text(value, x, y, scale, color) {
  for (const [index, letter] of [...value].entries()) {
    const glyph = glyphs[letter];
    if (!glyph) continue;
    glyph.forEach((row, rowIndex) => [...row].forEach((pixel, column) => {
      if (pixel === "1") rectangle(x + index * 6 * scale + column * scale, y + rowIndex * scale, scale, scale, color);
    }));
  }
}

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const glow = Math.max(0, 1 - Math.hypot(x - 1030, y - 260) / 900);
    put(x, y, [Math.round(12 + 3 * glow), Math.round(18 + 19 * glow), Math.round(35 + 31 * glow)]);
  }
}
for (let x = 0; x < width; x += 60) rectangle(x, 0, 1, height, [25, 34, 50]);
for (let y = 0; y < height; y += 60) rectangle(0, y, width, 1, [25, 34, 50]);
rectangle(70, 164, 64, 8, [75, 223, 190], 4);
text("YOUR APP", 70, 218, 11, [239, 246, 255]);
text("YOUR SAAS STARTER", 72, 329, 3, [141, 166, 194]);
rectangle(772, 159, 328, 302, [7, 13, 28], 22);
rectangle(760, 147, 328, 302, [36, 49, 71], 22);
rectangle(784, 173, 280, 34, [47, 65, 89], 8);
circle(802, 190, 5, [75, 223, 190]);
circle(823, 190, 5, [88, 136, 255]);
circle(844, 190, 5, [141, 166, 194]);
rectangle(784, 228, 106, 90, [48, 78, 104], 10);
rectangle(912, 228, 152, 12, [88, 136, 255], 6);
rectangle(912, 254, 124, 9, [86, 112, 141], 4);
rectangle(912, 277, 142, 9, [86, 112, 141], 4);
rectangle(912, 300, 98, 9, [86, 112, 141], 4);
rectangle(791, 351, 58, 71, [58, 109, 178], 7);
rectangle(864, 331, 58, 91, [70, 140, 217], 7);
rectangle(937, 308, 58, 114, [75, 223, 190], 7);
rectangle(72, 492, 1056, 1, [47, 65, 89]);
text("START YOUR APP", 72, 530, 2, [141, 166, 194]);

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  name.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8);
  return result;
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 2;
const scanlines = Buffer.alloc((width * 3 + 1) * height);
for (let y = 0; y < height; y++) pixels.copy(scanlines, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
writeFileSync(new URL("../public/og-image.png", import.meta.url), Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(scanlines, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]));
