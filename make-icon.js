// Generates build/icon.ico — a 256x256 red circle on near-black background.
// Replace this file (or build/icon.ico) with your own ICO when you have one.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function makePNG(size, drawPixel) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const t = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, crcBuf]);
  };

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = drawPixel(x, y);
      row[1 + x * 4]     = r;
      row[1 + x * 4 + 1] = g;
      row[1 + x * 4 + 2] = b;
      row[1 + x * 4 + 3] = a;
    }
    rows.push(row);
  }
  const idat = zlib.deflateSync(Buffer.concat(rows));

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeICO(pngBuffer) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);       // reserved
  header.writeUInt16LE(1, 2);       // type = ICO
  header.writeUInt16LE(1, 4);       // image count

  const entry = Buffer.alloc(16);
  entry[0] = 0;                     // width 256 (encoded as 0)
  entry[1] = 0;                     // height 256 (encoded as 0)
  entry[2] = 0;                     // palette count
  entry[3] = 0;                     // reserved
  entry.writeUInt16LE(1, 4);        // color planes
  entry.writeUInt16LE(32, 6);       // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8);  // image size
  entry.writeUInt32LE(22, 12);      // offset (6 + 16)

  return Buffer.concat([header, entry, pngBuffer]);
}

const SIZE = 256;
const cx = SIZE / 2 - 0.5, cy = SIZE / 2 - 0.5;
const outerR = SIZE * 0.46;
const innerR = SIZE * 0.42;

function pixel(x, y) {
  const dx = x - cx, dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Antialiased disc edge
  const edge = outerR - dist;
  if (edge <= -1) return [8, 8, 8, 255];       // outside: near-black bg
  if (edge < 1) {
    const t = (edge + 1) / 2;
    return [
      Math.round(8  * (1 - t) + 220 * t),
      Math.round(8  * (1 - t) + 55  * t),
      Math.round(8  * (1 - t) + 55  * t),
      255,
    ];
  }
  // Subtle radial highlight inside disc
  const norm = dist / outerR;
  const highlight = Math.max(0, 1 - norm * 1.4);
  return [
    Math.min(255, Math.round(220 + highlight * 25)),
    Math.min(255, Math.round(55  + highlight * 35)),
    Math.min(255, Math.round(55  + highlight * 35)),
    255,
  ];
}

const png = makePNG(SIZE, pixel);
const ico = makeICO(png);

const buildDir = path.join(__dirname, 'build');
fs.mkdirSync(buildDir, { recursive: true });
fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico);
fs.writeFileSync(path.join(buildDir, 'icon.png'), png);
console.log('Wrote build/icon.ico and build/icon.png');
