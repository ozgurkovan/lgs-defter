// Ana ekran simgesi: mürekkep mavisi zemin üzerinde çizgili defter sayfası ve kırmızı kenar çizgisi.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function draw(size) {
  const px = Buffer.alloc(size * size * 3);
  const set = (x, y, [r, g, b]) => { const i = (y * size + x) * 3; px[i] = r; px[i + 1] = g; px[i + 2] = b; };
  const ink = [36, 72, 184], paper = [255, 253, 247], line = [190, 205, 232], red = [200, 55, 45];
  const s = size / 180;
  const left = Math.round(42 * s), right = Math.round(138 * s), top = Math.round(30 * s), bottom = Math.round(150 * s);
  const radius = 10 * s;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let c = ink;
    const inX = x >= left && x < right, inY = y >= top && y < bottom;
    if (inX && inY) {
      const cx = x < left + radius ? left + radius : x >= right - radius ? right - radius : x;
      const cy = y < top + radius ? top + radius : y >= bottom - radius ? bottom - radius : y;
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) {
        c = paper;
        if ((y - top) % Math.round(16 * s) === Math.round(15 * s) && y > top + 20 * s) c = line;
        if (Math.abs(x - (left + 20 * s)) < 1.6 * s) c = red;
      }
    }
    set(x, y, c);
  }
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 3 + 1)] = 0; px.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const size of [180, 512]) writeFileSync(join(root, 'docs', `icon-${size}.png`), draw(size));
console.log('simgeler yazıldı');
