#!/usr/bin/env node
// Generates the PWA icons (no dependencies): a 2x2 "dashboard" glyph on the brand orange.
// Usage: node scripts/make-icons.mjs   (outputs are committed; rerun only to change the design)
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const GREEN = [0xc2, 0x57, 0x0a], WHITE = [0xff, 0xff, 0xff];

// Signed distance to a rounded rectangle centred at (cx, cy) with half-sizes (hw, hh) and radius r.
const sdRound = (x, y, cx, cy, hw, hh, r) => {
  const qx = Math.abs(x - cx) - (hw - r), qy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

/** `fullBleed`: opaque square (maskable / apple-touch). Otherwise a rounded tile with transparent corners.
 *  `scale`: glyph size relative to the canvas (maskable icons must keep content inside the central 80%). */
function render(size, { fullBleed, scale }) {
  const px = Buffer.alloc(size * size * 4);
  const SS = 4; // 4x4 supersampling for smooth edges
  const half = size / 2, tile = size * scale, cell = tile * 0.42, gap = tile * 0.08, rad = cell * 0.22;
  const centres = [-1, 1].flatMap((i) => [-1, 1].map((j) => [half + i * (cell / 2 + gap / 2), half + j * (cell / 2 + gap / 2)]));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let bg = 0, fg = 0, fgA = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const X = x + (sx + 0.5) / SS, Y = y + (sy + 0.5) / SS;
      if (fullBleed || sdRound(X, Y, half, half, half, half, size * 0.22) <= 0) bg++;
      centres.forEach(([cx, cy], k) => { if (sdRound(X, Y, cx, cy, cell / 2, cell / 2, rad) <= 0) { fg++; fgA += k === 3 ? 0.55 : 1; } });
    }
    const n = SS * SS, a = bg / n, f = Math.min(fgA / n, 1), o = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) px[o + c] = Math.round(GREEN[c] * (1 - f) + WHITE[c] * f);
    px[o + 3] = Math.round(255 * Math.max(a, fg / n));
  }
  return png(size, px);
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); // filter byte 0
  const chunk = (type, data) => {
    const t = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4);
    len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

writeFileSync('public/icons/icon-192.png', render(192, { fullBleed: false, scale: 0.62 }));
writeFileSync('public/icons/icon-512.png', render(512, { fullBleed: false, scale: 0.62 }));
writeFileSync('public/icons/maskable-512.png', render(512, { fullBleed: true, scale: 0.5 }));
writeFileSync('public/apple-touch-icon.png', render(180, { fullBleed: true, scale: 0.56 }));
writeFileSync('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#c2570a"/><g fill="#fff"><rect x="13" y="13" width="17" height="17" rx="4"/><rect x="34" y="13" width="17" height="17" rx="4"/><rect x="13" y="34" width="17" height="17" rx="4"/><rect x="34" y="34" width="17" height="17" rx="4" opacity=".55"/></g></svg>\n`);
console.log('icons written');
