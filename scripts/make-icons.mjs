// 앱 아이콘 생성 (의존성 없이 PNG 직접 인코딩). 실행: node scripts/make-icons.mjs
// 디자인: 원형 순회로 위 6개 권역(파랑 원/빨강 네모 교대)과 가운데 노란 투표 표식. public/icon.svg와 같은 도안.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x1d, 0x1d, 0x1f];
const RING = [0x55, 0x58, 0x60];
const BLUE = [0x5b, 0x93, 0xf5];
const RED = [0xf0, 0x6b, 0x6b];
const YELLOW = [0xf2, 0xb0, 0x1e];

/** 단위 정사각형(0~1) 좌표에서 색을 돌려준다. maskable이면 도안을 안전 영역(80%) 안으로 줄인다 */
function shade(x, y, maskable) {
  const k = maskable ? 0.8 : 1;
  const u = (x - 0.5) / k + 0.5;
  const v = (y - 0.5) / k + 0.5;
  const dx = u - 0.5;
  const dy = v - 0.5;
  const d = Math.hypot(dx, dy);
  for (let i = 0; i < 6; i++) {
    const a = ((-90 + 60 * i) * Math.PI) / 180;
    const cx = 0.5 + 0.33 * Math.cos(a);
    const cy = 0.5 + 0.33 * Math.sin(a);
    if (i % 2 === 0) {
      if (Math.hypot(u - cx, v - cy) < 0.085) return BLUE;
    } else if (Math.abs(u - cx) < 0.075 && Math.abs(v - cy) < 0.075) return RED;
  }
  if (Math.abs(d - 0.33) < 0.012) return RING;
  // 가운데 체크 표시 상자
  if (Math.abs(dx) < 0.13 && Math.abs(dy) < 0.13) {
    const inner = Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1;
    if (!inner) return YELLOW;
    // 체크 (두 선분)
    const onSeg = (x1, y1, x2, y2) => {
      const px = dx - x1, py = dy - y1, sx = x2 - x1, sy = y2 - y1;
      const t = Math.max(0, Math.min(1, (px * sx + py * sy) / (sx * sx + sy * sy)));
      return Math.hypot(px - t * sx, py - t * sy) < 0.018;
    };
    if (onSeg(-0.06, 0.0, -0.015, 0.05) || onSeg(-0.015, 0.05, 0.065, -0.05)) return YELLOW;
    return BG;
  }
  if (!maskable) {
    // 둥근 모서리 바깥은 투명
    const r = 0.18;
    const qx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
    const qy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
    if (Math.hypot(qx, qy) > r) return null;
  }
  return BG;
}

function render(size, maskable) {
  const SS = 4;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, maskable);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a++;
        }
      }
      const o = (y * size + x) * 4;
      if (a) {
        px[o] = r / a; px[o + 1] = g / a; px[o + 2] = b / a;
      }
      px[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return px;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, maskable) {
  const px = render(size, maskable);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = new URL('../public/', import.meta.url);
writeFileSync(new URL('icon-192.png', out), png(192, false));
writeFileSync(new URL('icon-512.png', out), png(512, false));
writeFileSync(new URL('icon-maskable-512.png', out), png(512, true));
writeFileSync(new URL('icon-180.png', out), png(180, true)); // iOS는 모서리를 직접 깎으므로 꽉 찬 배경
console.log('icons written');
