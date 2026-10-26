// node scripts/make-icons.mjs
// Generates the PWA icons (two overlapping speech bubbles = "samvaad", dialogue) as PNG files with no dependencies.
import fs from "node:fs";
import zlib from "node:zlib";

const INK = [15, 27, 51], TEAL = [13, 122, 111], WHITE = [255, 255, 255];

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const SS = 3;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const p = pixel((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
        r += p[0] * p[3]; g += p[1] * p[3]; b += p[2] * p[3]; a += p[3];
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const n = SS * SS;
      raw[o] = a ? Math.round(r / a) : 0; raw[o + 1] = a ? Math.round(g / a) : 0; raw[o + 2] = a ? Math.round(b / a) : 0; raw[o + 3] = Math.round((a / n) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const inRoundRect = (x, y, cx, cy, hw, hh, r) => {
  const dx = Math.max(Math.abs(x - cx) - (hw - r), 0), dy = Math.max(Math.abs(y - cy) - (hh - r), 0);
  return dx * dx + dy * dy <= r * r;
};
// u,v in 0..1. scale s shrinks the artwork toward the centre (maskable icons keep it inside the safe zone).
function artwork(u, v, s) {
  const x = 0.5 + (u - 0.5) / s, y = 0.5 + (v - 0.5) / s;
  // white bubble (upper left) with a tail, teal bubble (lower right)
  const white = inRoundRect(x, y, 0.4, 0.4, 0.22, 0.17, 0.12) || (x > 0.27 && x < 0.38 && y > 0.5 && y < 0.64 && y - 0.5 < (0.38 - x) * 1.2 + 0.0 && x > 0.27);
  const teal = inRoundRect(x, y, 0.6, 0.6, 0.22, 0.17, 0.12) || (x > 0.62 && x < 0.73 && y > 0.7 && y < 0.84 && (y - 0.7) < (x - 0.62) * 1.2);
  const dots = [0.33, 0.4, 0.47].some((dx) => (x - dx) ** 2 + (y - 0.4) ** 2 < 0.0009);
  if (white && !teal) return dots ? INK : WHITE;
  if (teal) return white ? INK : TEAL;
  return null;
}
function icon(size, { maskable }) {
  return png(size, (u, v) => {
    if (!maskable && !inRoundRect(u, v, 0.5, 0.5, 0.5, 0.5, 0.2)) return [0, 0, 0, 0];
    const c = artwork(u, v, maskable ? 0.62 : 0.86);
    const col = c ?? INK;
    return [col[0], col[1], col[2], 1];
  });
}

fs.mkdirSync("public/icons", { recursive: true });
fs.writeFileSync("public/icons/icon-192.png", icon(192, { maskable: false }));
fs.writeFileSync("public/icons/icon-512.png", icon(512, { maskable: false }));
fs.writeFileSync("public/icons/maskable-512.png", icon(512, { maskable: true }));
fs.writeFileSync("public/icons/apple-touch-icon.png", icon(180, { maskable: true }));
console.log("icons written to public/icons");
