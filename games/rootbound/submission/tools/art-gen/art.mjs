import { fileURLToPath } from 'node:url';
// 클로드 디자인 부품 그림 생성기(디자인 에이전트가 작성). node art.mjs → ../../art/*.svg, verify.mjs = 명당 배지 대조, canvas.mjs = 디자인 캔버스 아트보드
// 「냥냥 골목」 부품 그림(SVG) 생성기 — 손으로 짠 벡터 그림 조각을 조합하고, 규칙 표시는 draw.mjs 데이터에서 계산한다.
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SUB = fileURLToPath(new URL('../..', import.meta.url));
const { SPOTS, SPOT_IDS, SEAT, SEAT_DARK, SEAT_LIGHT, SEAT_NAME, TERRAIN, px } = await import(pathToFileURL(`${SUB}/tools/draw.mjs`).href);
const { GOALS } = await import(pathToFileURL(`${SUB}/tools/goals.mjs`).href);
const OUT = `${SUB}/art`;
mkdirSync(OUT, { recursive: true });

const FONT = `Pretendard, 'Malgun Gothic', sans-serif`;
const INK = '#3b2a1c';
const SQ3 = Math.sqrt(3);
const f = (n) => (Math.round(n * 100) / 100).toString();
const T = (x, y, size, s, { fill = INK, weight = 800, anchor = 'middle', extra = '' } = {}) =>
  `<text x="${f(x)}" y="${f(y)}" font-size="${f(size)}" text-anchor="${anchor}" font-weight="${weight}" fill="${fill}" font-family="${FONT}"${extra}>${s}</text>`;
const hexPts = (cx, cy, R) => {
  const p = [];
  for (let k = 0; k < 6; k++) {
    const a = ((60 * k - 30) * Math.PI) / 180;
    p.push(`${f(cx + R * Math.cos(a))},${f(cy + R * Math.sin(a))}`);
  }
  return p.join(' ');
};
const svg = (vb, inner, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${title}" font-family="${FONT}">\n<title>${title}</title>\n${inner}\n</svg>\n`;
const files = {};
const save = (name, content) => {
  files[name] = content;
  writeFileSync(`${OUT}/${name}`, content);
};

// ---------------------------------------------------------------------------
// 고양이 (seat 0 치즈 · 1 턱시도 · 2 고등어 · 3 동네 삼색이(무리 아님))
// ---------------------------------------------------------------------------
const CAT = [
  { base: SEAT[0], dark: SEAT_DARK[0], light: '#ffe6c4', iris: '#8cc152', line: INK },
  { base: SEAT[1], dark: '#18181c', light: '#ffffff', iris: '#f2d24b', line: '#111114' },
  { base: SEAT[2], dark: SEAT_DARK[2], light: '#e9f0f7', iris: '#f2c14b', line: '#2c3b4c' },
  { base: '#fbf4ea', dark: '#d58e4c', light: '#ffffff', iris: '#7fb069', line: INK },
];
/** 앞에서 본 고양이 머리. 중심 (0,0), s = 머리 반지름 */
function catHead(seat, s, { look = 0, sleepy = false, x = 0, y = 0 } = {}) {
  const c = CAT[seat];
  const w = s * 0.075;
  const o = [];
  const ear = (sx) =>
    `<path d="M${f(sx * 0.88 * s)},${f(-0.3 * s)} L${f(sx * 0.72 * s)},${f(-1.08 * s)} L${f(sx * 0.18 * s)},${f(-0.76 * s)} Z" fill="${c.base}" stroke="${c.line}" stroke-width="${f(w)}" stroke-linejoin="round"/>` +
    `<path d="M${f(sx * 0.7 * s)},${f(-0.42 * s)} L${f(sx * 0.66 * s)},${f(-0.86 * s)} L${f(sx * 0.36 * s)},${f(-0.68 * s)} Z" fill="#f4a7a3"/>`;
  o.push(ear(-1), ear(1));
  o.push(`<ellipse cx="0" cy="0" rx="${f(0.98 * s)}" ry="${f(0.82 * s)}" fill="${c.base}" stroke="${c.line}" stroke-width="${f(w)}"/>`);
  if (seat === 0 || seat === 2) {
    o.push(`<path d="M${f(-0.16 * s)},${f(-0.8 * s)} L${f(-0.12 * s)},${f(-0.5 * s)} M0,${f(-0.82 * s)} V${f(-0.46 * s)} M${f(0.16 * s)},${f(-0.8 * s)} L${f(0.12 * s)},${f(-0.5 * s)} M${f(-0.96 * s)},${f(0.05 * s)} h${f(0.26 * s)} M${f(-0.92 * s)},${f(0.25 * s)} h${f(0.24 * s)} M${f(0.96 * s)},${f(0.05 * s)} h${f(-0.26 * s)} M${f(0.92 * s)},${f(0.25 * s)} h${f(-0.24 * s)}" stroke="${c.dark}" stroke-width="${f(s * 0.1)}" stroke-linecap="round"/>`);
    o.push(`<ellipse cx="0" cy="${f(0.36 * s)}" rx="${f(0.46 * s)}" ry="${f(0.32 * s)}" fill="${c.light}"/>`);
  } else if (seat === 1) {
    o.push(`<path d="M${f(-0.62 * s)},${f(0.52 * s)} C${f(-0.6 * s)},${f(0.12 * s)} ${f(-0.22 * s)},${f(0.02 * s)} ${f(-0.08 * s)},${f(-0.3 * s)} L0,${f(-0.62 * s)} L${f(0.08 * s)},${f(-0.3 * s)} C${f(0.22 * s)},${f(0.02 * s)} ${f(0.6 * s)},${f(0.12 * s)} ${f(0.62 * s)},${f(0.52 * s)} C${f(0.3 * s)},${f(0.8 * s)} ${f(-0.3 * s)},${f(0.8 * s)} ${f(-0.62 * s)},${f(0.52 * s)} Z" fill="#fff"/>`);
  } else {
    o.push(`<path d="M${f(0.15 * s)},${f(-0.8 * s)} C${f(0.6 * s)},${f(-0.75 * s)} ${f(0.92 * s)},${f(-0.45 * s)} ${f(0.95 * s)},${f(-0.05 * s)} C${f(0.6 * s)},${f(-0.1 * s)} ${f(0.3 * s)},${f(-0.4 * s)} ${f(0.15 * s)},${f(-0.8 * s)} Z" fill="${c.dark}"/>`);
    o.push(`<path d="M${f(-0.2 * s)},${f(-0.8 * s)} C${f(-0.6 * s)},${f(-0.72 * s)} ${f(-0.9 * s)},${f(-0.5 * s)} ${f(-0.95 * s)},${f(-0.2 * s)} C${f(-0.6 * s)},${f(-0.3 * s)} ${f(-0.35 * s)},${f(-0.5 * s)} ${f(-0.2 * s)},${f(-0.8 * s)} Z" fill="#4a3a30"/>`);
  }
  // 외곽선을 다시 그려 무늬가 선을 덮지 않게
  o.push(`<ellipse cx="0" cy="0" rx="${f(0.98 * s)}" ry="${f(0.82 * s)}" fill="none" stroke="${c.line}" stroke-width="${f(w)}"/>`);
  const ex = 0.36 * s;
  const ey = -0.04 * s;
  if (sleepy) {
    o.push(`<path d="M${f(-ex - 0.14 * s)},${f(ey)} q${f(0.14 * s)},${f(0.12 * s)} ${f(0.28 * s)},0 M${f(ex - 0.14 * s)},${f(ey)} q${f(0.14 * s)},${f(0.12 * s)} ${f(0.28 * s)},0" stroke="${seat === 1 ? '#fff' : c.line}" stroke-width="${f(w)}" fill="none" stroke-linecap="round"/>`);
  } else {
    for (const sx of [-1, 1]) {
      const cx = sx * ex;
      o.push(`<ellipse cx="${f(cx)}" cy="${f(ey)}" rx="${f(0.15 * s)}" ry="${f(0.18 * s)}" fill="${c.iris}" stroke="${c.line}" stroke-width="${f(w * 0.6)}"/>`);
      o.push(`<ellipse cx="${f(cx + look * 0.06 * s)}" cy="${f(ey + 0.01 * s)}" rx="${f(0.07 * s)}" ry="${f(0.14 * s)}" fill="#16120f"/>`);
      o.push(`<circle cx="${f(cx + look * 0.06 * s - 0.04 * s)}" cy="${f(ey - 0.07 * s)}" r="${f(0.035 * s)}" fill="#fff"/>`);
    }
  }
  o.push(`<path d="M${f(-0.08 * s)},${f(0.2 * s)} h${f(0.16 * s)} l${f(-0.08 * s)},${f(0.09 * s)} z" fill="#e8848a" stroke="${c.line}" stroke-width="${f(w * 0.5)}" stroke-linejoin="round"/>`);
  const ml = seat === 1 ? '#3a3a40' : c.line;
  o.push(`<path d="M0,${f(0.29 * s)} q${f(-0.06 * s)},${f(0.12 * s)} ${f(-0.15 * s)},${f(0.05 * s)} M0,${f(0.29 * s)} q${f(0.06 * s)},${f(0.12 * s)} ${f(0.15 * s)},${f(0.05 * s)}" stroke="${ml}" stroke-width="${f(w * 0.6)}" fill="none" stroke-linecap="round"/>`);
  const wc = seat === 1 ? '#ffffff' : '#7a6650';
  o.push(`<path d="M${f(-0.4 * s)},${f(0.3 * s)} l${f(-0.5 * s)},${f(-0.06 * s)} M${f(-0.4 * s)},${f(0.38 * s)} l${f(-0.48 * s)},${f(0.08 * s)} M${f(0.4 * s)},${f(0.3 * s)} l${f(0.5 * s)},${f(-0.06 * s)} M${f(0.4 * s)},${f(0.38 * s)} l${f(0.48 * s)},${f(0.08 * s)}" stroke="${wc}" stroke-width="${f(w * 0.35)}" stroke-linecap="round" opacity="0.8"/>`);
  return `<g transform="translate(${f(x)},${f(y)})">${o.join('')}</g>`;
}
/** 앉은 고양이(정면). 원점 = 발 아래 가운데, s = 크기 단위(높이 약 3s) */
function sittingCat(seat, s, { x = 0, y = 0, look = 0, flip = false, sleepy = false } = {}) {
  const c = CAT[seat];
  const w = s * 0.08;
  const sx = flip ? -1 : 1;
  const o = [];
  o.push(`<ellipse cx="0" cy="${f(s * 0.04)}" rx="${f(s * 1.1)}" ry="${f(s * 0.16)}" fill="#3a2a17" opacity="0.18"/>`);
  o.push(`<path d="M${f(sx * 0.75 * s)},${f(-0.15 * s)} C${f(sx * 1.6 * s)},${f(-0.1 * s)} ${f(sx * 1.7 * s)},${f(-0.9 * s)} ${f(sx * 1.35 * s)},${f(-1.3 * s)}" stroke="${c.line}" stroke-width="${f(s * 0.34)}" fill="none" stroke-linecap="round"/>`);
  o.push(`<path d="M${f(sx * 0.75 * s)},${f(-0.15 * s)} C${f(sx * 1.6 * s)},${f(-0.1 * s)} ${f(sx * 1.7 * s)},${f(-0.9 * s)} ${f(sx * 1.35 * s)},${f(-1.3 * s)}" stroke="${seat === 3 ? '#d58e4c' : c.base}" stroke-width="${f(s * 0.2)}" fill="none" stroke-linecap="round"/>`);
  o.push(`<path d="M${f(-0.85 * s)},0 C${f(-1.0 * s)},${f(-0.9 * s)} ${f(-0.55 * s)},${f(-1.65 * s)} 0,${f(-1.7 * s)} C${f(0.55 * s)},${f(-1.65 * s)} ${f(1.0 * s)},${f(-0.9 * s)} ${f(0.85 * s)},0 Z" fill="${c.base}" stroke="${c.line}" stroke-width="${f(w)}" stroke-linejoin="round"/>`);
  if (seat === 0 || seat === 2)
    o.push(`<path d="M${f(-0.8 * s)},${f(-0.7 * s)} q${f(0.2 * s)},${f(0.05 * s)} ${f(0.3 * s)},${f(0.2 * s)} M${f(-0.85 * s)},${f(-0.35 * s)} q${f(0.2 * s)},${f(0.05 * s)} ${f(0.3 * s)},${f(0.2 * s)} M${f(0.8 * s)},${f(-0.7 * s)} q${f(-0.2 * s)},${f(0.05 * s)} ${f(-0.3 * s)},${f(0.2 * s)} M${f(0.85 * s)},${f(-0.35 * s)} q${f(-0.2 * s)},${f(0.05 * s)} ${f(-0.3 * s)},${f(0.2 * s)}" stroke="${c.dark}" stroke-width="${f(s * 0.1)}" stroke-linecap="round" fill="none"/>`);
  o.push(`<path d="M${f(-0.38 * s)},${f(-1.45 * s)} C${f(-0.5 * s)},${f(-0.8 * s)} ${f(-0.3 * s)},${f(-0.2 * s)} 0,${f(-0.15 * s)} C${f(0.3 * s)},${f(-0.2 * s)} ${f(0.5 * s)},${f(-0.8 * s)} ${f(0.38 * s)},${f(-1.45 * s)} Z" fill="${c.light}"/>`);
  o.push(`<ellipse cx="${f(-0.32 * s)}" cy="${f(-0.08 * s)}" rx="${f(0.26 * s)}" ry="${f(0.15 * s)}" fill="${c.light}" stroke="${c.line}" stroke-width="${f(w * 0.8)}"/>`);
  o.push(`<ellipse cx="${f(0.32 * s)}" cy="${f(-0.08 * s)}" rx="${f(0.26 * s)}" ry="${f(0.15 * s)}" fill="${c.light}" stroke="${c.line}" stroke-width="${f(w * 0.8)}"/>`);
  o.push(catHead(seat, s * 0.82, { look, sleepy, y: -1.78 * s }));
  return `<g transform="translate(${f(x)},${f(y)})">${o.join('')}</g>`;
}
/** 웅크린(식빵) 고양이 옆모습. 원점 = 몸 아래 가운데 */
function loafCat(seat, s, { x = 0, y = 0, flip = false } = {}) {
  const c = CAT[seat];
  const w = s * 0.08;
  const o = [];
  o.push(`<ellipse cx="0" cy="${f(-0.02 * s)}" rx="${f(1.15 * s)}" ry="${f(0.12 * s)}" fill="#3a2a17" opacity="0.18"/>`);
  o.push(`<path d="M${f(1.0 * s)},${f(-0.15 * s)} C${f(0.7 * s)},${f(0.05 * s)} ${f(-0.4 * s)},${f(0.08 * s)} ${f(-0.8 * s)},${f(-0.05 * s)}" stroke="${c.line}" stroke-width="${f(s * 0.3)}" fill="none" stroke-linecap="round"/>`);
  o.push(`<path d="M${f(1.0 * s)},${f(-0.15 * s)} C${f(0.7 * s)},${f(0.05 * s)} ${f(-0.4 * s)},${f(0.08 * s)} ${f(-0.8 * s)},${f(-0.05 * s)}" stroke="${seat === 3 ? '#d58e4c' : c.base}" stroke-width="${f(s * 0.17)}" fill="none" stroke-linecap="round"/>`);
  o.push(`<path d="M${f(-1.0 * s)},0 C${f(-1.05 * s)},${f(-0.8 * s)} ${f(-0.4 * s)},${f(-1.0 * s)} ${f(0.2 * s)},${f(-0.95 * s)} C${f(0.9 * s)},${f(-0.9 * s)} ${f(1.1 * s)},${f(-0.4 * s)} ${f(1.0 * s)},0 Z" fill="${c.base}" stroke="${c.line}" stroke-width="${f(w)}" stroke-linejoin="round"/>`);
  if (seat === 3) o.push(`<path d="M${f(0.1 * s)},${f(-0.95 * s)} C${f(0.6 * s)},${f(-0.9 * s)} ${f(0.9 * s)},${f(-0.6 * s)} ${f(0.95 * s)},${f(-0.3 * s)} C${f(0.5 * s)},${f(-0.4 * s)} ${f(0.2 * s)},${f(-0.6 * s)} ${f(0.1 * s)},${f(-0.95 * s)} Z" fill="#d58e4c"/>`);
  if (seat === 0 || seat === 2) o.push(`<path d="M${f(0.1 * s)},${f(-0.92 * s)} q${f(0.05 * s)},${f(0.25 * s)} 0,${f(0.4 * s)} M${f(0.45 * s)},${f(-0.85 * s)} q${f(0.05 * s)},${f(0.25 * s)} 0,${f(0.4 * s)}" stroke="${c.dark}" stroke-width="${f(s * 0.1)}" stroke-linecap="round" fill="none"/>`);
  o.push(catHead(seat, s * 0.62, { sleepy: true, x: -0.85 * s, y: -0.7 * s }));
  return `<g transform="translate(${f(x)},${f(y)})${flip ? ' scale(-1,1)' : ''}">${o.join('')}</g>`;
}

// ---------------------------------------------------------------------------
// 명당 그림 (지역 좌표: 가운데 0,0, 대략 x ±46 · y ±24)
// ---------------------------------------------------------------------------
const S = 2.2; // 기본 선 굵기
const st = `stroke="${INK}" stroke-width="${S}" stroke-linejoin="round" stroke-linecap="round"`;
const ILL = {
  oak: () => `
<ellipse cx="0" cy="21" rx="46" ry="4" fill="#3a2a17" opacity="0.15"/>
<rect x="-40" y="6" width="7" height="15" rx="1.5" fill="#8a5a2e" ${st}/><rect x="33" y="6" width="7" height="15" rx="1.5" fill="#8a5a2e" ${st}/><rect x="-3.5" y="6" width="7" height="13" rx="1.5" fill="#8a5a2e" ${st}/>
<path d="M-46,4 L-38,-8 H38 L46,4 Z" fill="#dca866" ${st}/>
<path d="M-27,-8 L-31,4 M-13,-8 L-15,4 M0,-8 V4 M13,-8 L15,4 M27,-8 L31,4" stroke="#a8743c" stroke-width="1.4"/>
<rect x="-46" y="4" width="92" height="6" rx="1.5" fill="#b67b3e" ${st}/>
${loafCat(3, 13, { x: -16, y: -4 })}
<path d="M14,-6 A12,12 0 0 1 38,-6 Z" fill="#7bbf5a" ${st}/><path d="M16.5,-6 A9.5,9.5 0 0 1 35.5,-6 Z" fill="#f2565b"/>
<path d="M21,-9 l0.8,1.6 M26,-12 l0,1.8 M31,-9 l-0.8,1.6" stroke="#2a1d14" stroke-width="1.6" stroke-linecap="round"/>`,
  pine: () => `
<ellipse cx="0" cy="22" rx="40" ry="3.5" fill="#3a2a17" opacity="0.15"/>
<path d="M-30,-8 L-24,-17 H24 L30,-8 Z" fill="#a8743c" ${st}/>
${catHead(3, 13.5, { look: 0.6, y: -10 })}
<path d="M-32,-6 L-46,-15 L-38,-21 L-28,-9 Z" fill="#d7a76c" ${st}/>
<path d="M32,-6 L46,-15 L38,-21 L28,-9 Z" fill="#d7a76c" ${st}/>
<rect x="-32" y="-6" width="64" height="28" rx="2" fill="#e2b783" ${st}/>
<rect x="-5" y="-6" width="10" height="28" fill="#f3dcae" opacity="0.85"/>
<ellipse cx="-9" cy="-5" rx="5" ry="3.4" fill="#fff" ${st}/><ellipse cx="9" cy="-5" rx="5" ry="3.4" fill="#fff" ${st}/>
<g fill="#b58650" opacity="0.8"><circle cx="-20" cy="10" r="3.2"/><circle cx="-24.5" cy="5.5" r="1.4"/><circle cx="-21.5" cy="4.2" r="1.4"/><circle cx="-18" cy="4.6" r="1.4"/><circle cx="-15.8" cy="7.2" r="1.4"/></g>
<path d="M14,6 h12 M14,11 h9" stroke="#b58650" stroke-width="1.6" stroke-linecap="round"/>`,
  grass: () => {
    const fl = [
      [-30, -6, '#ff8fa3'], [-17, -14, '#ffd166'], [-3, -8, '#f2565b'], [10, -16, '#ffffff'], [23, -7, '#b79ad6'], [34, -13, '#ff8fa3'],
    ];
    let o = `<ellipse cx="0" cy="22" rx="44" ry="3.5" fill="#3a2a17" opacity="0.15"/>`;
    for (const [x, y] of fl) o += `<path d="M${x},${y + 4} Q${x + 1},${y + 12} ${x},4" stroke="#3f8a3a" stroke-width="2" fill="none"/><path d="M${x},${y + 13} q-6,-2 -7,-7 q5,1 7,5 z" fill="#5fae4a" stroke="#2e6b22" stroke-width="1"/>`;
    for (const [x, y, c] of fl)
      o += `<g transform="translate(${x},${y})"><circle cx="0" cy="-4.2" r="3.4" fill="${c}" stroke="${INK}" stroke-width="1.3"/><circle cx="4" cy="-1.3" r="3.4" fill="${c}" stroke="${INK}" stroke-width="1.3"/><circle cx="2.5" cy="3.4" r="3.4" fill="${c}" stroke="${INK}" stroke-width="1.3"/><circle cx="-2.5" cy="3.4" r="3.4" fill="${c}" stroke="${INK}" stroke-width="1.3"/><circle cx="-4" cy="-1.3" r="3.4" fill="${c}" stroke="${INK}" stroke-width="1.3"/><circle cx="0" cy="0" r="2.4" fill="#ffb627" stroke="${INK}" stroke-width="1"/></g>`;
    o += `<rect x="-42" y="2" width="84" height="6" rx="1.5" fill="#7a4f2e" ${st}/>
<rect x="-44" y="7" width="88" height="15" rx="2" fill="#d27a52" ${st}/>
<path d="M-44,14.5 H44 M-30,7 V14.5 M-8,7 V14.5 M14,7 V14.5 M34,7 V14.5 M-19,14.5 V22 M3,14.5 V22 M25,14.5 V22" stroke="#9c4f2f" stroke-width="1.3"/>
<path d="M-26,-22 q3,-4 6,0 q3,-4 6,0 q-3,2 -6,0 q-3,2 -6,0 z" fill="#ffe066" stroke="${INK}" stroke-width="1.1"/>`;
    return o;
  },
  kudzu: () => `
<rect x="-44" y="-22" width="88" height="42" rx="2" fill="#efe4d6" ${st}/>
<path d="M-44,-12 H44 M-44,-2 H44 M-44,8 H44 M-30,-22 V-12 M-6,-22 V-12 M18,-22 V-12 M38,-22 V-12 M-40,-12 V-2 M-18,-12 V-2 M30,-12 V-2 M-30,-2 V8 M24,-2 V8 M-40,8 V20 M34,8 V20" stroke="#cbb9a2" stroke-width="1.4"/>
<path d="M-15,20 V4 A15,15 0 0 1 15,4 V20 Z" fill="#2b2420" ${st}/>
<circle cx="-4.5" cy="7" r="2.6" fill="#fff"/><circle cx="4.5" cy="7" r="2.6" fill="#fff"/><circle cx="-4" cy="7.4" r="1.3" fill="#111"/><circle cx="5" cy="7.4" r="1.3" fill="#111"/>
<path d="M-7,1 l-2.5,-4 l4.5,1.4 M7,1 l2.5,-4 l-4.5,1.4" fill="#8f7d6c"/>
<path d="M13,19 C22,20 24,12 32,15" stroke="#e39a9a" stroke-width="2.2" fill="none" stroke-linecap="round"/>
<path d="M-44,20 H44" stroke="${INK}" stroke-width="${S}"/>
<path d="M-38,19 L-22,19 L-22,11 Z" fill="#ffd34d" ${st}/><circle cx="-27" cy="16" r="1.6" fill="#e0a92a"/><circle cx="-24" cy="13.5" r="1" fill="#e0a92a"/>`,
  fern: () => {
    let tiles = '';
    for (let x = -26; x <= 26; x += 6.5) tiles += `M${x},-17 Q${x * 1.1},-6 ${x * 1.32},2 `;
    return `
<rect x="-30" y="2" width="60" height="20" fill="#f5e6c8" ${st}/>
<path d="M-30,8 H30 M-22,2 V22 M22,2 V22" stroke="#8a5a2e" stroke-width="2.4"/>
<rect x="-12" y="8" width="24" height="14" fill="#fff8e6" stroke="#8a5a2e" stroke-width="1.8"/><path d="M0,8 V22 M-12,15 H12" stroke="#8a5a2e" stroke-width="1.2"/>
<path d="M-46,-1 Q-40,1 -34,1 L-26,-17 H26 L34,1 Q40,1 46,-1 Q42,6 36,6 H-36 Q-42,6 -46,-1 Z" fill="#7b8794" ${st}/>
<path d="${tiles}" stroke="#5a6572" stroke-width="1.3" fill="none"/>
<path d="M-36,6 H36" stroke="#4f5966" stroke-width="2.6"/>
<path d="M-30,-21 H30 Q34,-21 35,-25 Q30,-17 26,-17 H-26 Q-30,-17 -35,-25 Q-34,-21 -30,-21 Z" fill="#4f5966" ${st}/>
${sittingCat(3, 5.2, { x: 15, y: -21, look: -1 })}`;
  },
  dandelion: () => {
    const leaf = (x, y, a, s = 1) =>
      `<path transform="translate(${x},${y}) rotate(${a}) scale(${s})" d="M0,0 C-5,-2 -6,-9 0,-13 C6,-9 5,-2 0,0 Z" fill="#6fbf55" stroke="#2e6b22" stroke-width="1.2"/><path transform="translate(${x},${y}) rotate(${a}) scale(${s})" d="M0,-1 V-11" stroke="#2e6b22" stroke-width="0.8"/>`;
    return `
<ellipse cx="0" cy="22" rx="24" ry="3" fill="#3a2a17" opacity="0.15"/>
<path d="M0,0 V-18 M0,-6 L-9,-14 M0,-8 L9,-17" stroke="#3f8a3a" stroke-width="2" fill="none"/>
${leaf(-1, -2, -60)}${leaf(1, -2, 60)}${leaf(-6, -10, -35, 0.9)}${leaf(6, -12, 38, 0.9)}${leaf(-2, -16, -12, 0.85)}${leaf(4, -18, 14, 0.8)}
<path d="M-9,-14 v-7 M9,-17 v-6 M0,-18 v-6" stroke="#b79ad6" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="1.8 1.4"/>
<path d="M-16,4 H16 L12,22 H-12 Z" fill="#d9744a" ${st}/>
<rect x="-19" y="-1" width="38" height="6" rx="2" fill="#e88a5c" ${st}/>
<path d="M-7,13 q3,-3 7,0 q4,-3 7,0" stroke="#fff3e6" stroke-width="1.6" fill="none" stroke-linecap="round"/>
<path d="M-32,-14 l1.4,3.6 l3.6,1.4 l-3.6,1.4 l-1.4,3.6 l-1.4,-3.6 l-3.6,-1.4 l3.6,-1.4 z" fill="#ffd34d" stroke="${INK}" stroke-width="0.9"/>
<path d="M31,-4 l1.2,3 l3,1.2 l-3,1.2 l-1.2,3 l-1.2,-3 l-3,-1.2 l3,-1.2 z" fill="#ffd34d" stroke="${INK}" stroke-width="0.9"/>
<path d="M24,-20 l0.9,2.2 l2.2,0.9 l-2.2,0.9 l-0.9,2.2 l-0.9,-2.2 l-2.2,-0.9 l2.2,-0.9 z" fill="#fff" stroke="${INK}" stroke-width="0.8"/>`;
  },
  lotus: () => `
<ellipse cx="0" cy="22" rx="42" ry="3.5" fill="#3a2a17" opacity="0.15"/>
<path d="M-30,-24 Q-4,-30 16,-12" stroke="#6b4423" stroke-width="2" fill="none" stroke-linecap="round"/>
<path d="M-22,22 V12 M-8,22 V12" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>
<path d="M-28,14 C-30,0 -24,-4 -15,-4 C-6,-4 0,0 -2,14 Z" fill="#6d8f5a" ${st}/>
<path d="M-19,-3 V12 M-11,-3 V12" stroke="#4f6b40" stroke-width="1.2"/><rect x="-24" y="3" width="6" height="4" rx="1" fill="#4f6b40"/>
<circle cx="-15" cy="-11" r="8.2" fill="#f2c9a0" ${st}/>
<path d="M-24,-13 Q-23,-23 -15,-23 Q-7,-23 -6,-13 Z" fill="#e8d9a8" ${st}/><path d="M-27,-13 H-3" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
<circle cx="-18" cy="-9.5" r="1.2" fill="${INK}"/><circle cx="-12" cy="-9.5" r="1.2" fill="${INK}"/>
<path d="M-19,-6 q4,2.5 8,0" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
<path d="M-4,4 Q4,0 8,-6" stroke="${INK}" stroke-width="4.5" fill="none" stroke-linecap="round"/><circle cx="9" cy="-7" r="3.2" fill="#f2c9a0" ${st}/>
<path d="M10,-4 C16,-12 28,-12 32,-5 C28,2 16,2 10,-4 Z" fill="#5b8fc7" ${st}/>
<path d="M32,-5 L40,-11 L39,1 Z" fill="#5b8fc7" ${st}/>
<circle cx="15" cy="-6" r="1.5" fill="#fff" stroke="${INK}" stroke-width="0.8"/><path d="M20,-9 q2,3 0,7 M24,-9 q2,3 0,7" stroke="#2c5a8a" stroke-width="1" fill="none"/>
<path d="M20,22 L18,8 H40 L38,22 Z" fill="#9fb3c2" ${st}/><path d="M17,8 H41" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
<path d="M24,8 L22,0 L28,3 Z M32,8 C30,2 36,0 37,4 Z" fill="#5b8fc7" stroke="${INK}" stroke-width="1.2"/>`,
  mushroom: () => `
<ellipse cx="2" cy="22" rx="38" ry="3.5" fill="#3a2a17" opacity="0.15"/>
<path d="M-14,22 V16 M-4,22 V16" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>
<path d="M-24,18 C-26,2 -20,-4 -9,-4 C2,-4 8,2 6,18 Z" fill="#a77fb5" ${st}/>
<path d="M-17,-1 C-18,8 -16,14 -15,18 H-3 C-2,14 0,8 -1,-1 Z" fill="#fff8ec" stroke="${INK}" stroke-width="1.4"/>
<circle cx="-9" cy="-12" r="8.2" fill="#f2c9a0" ${st}/>
<path d="M-17.5,-12 Q-18,-21 -9,-21 Q0,-21 -0.5,-12 Q-3,-17 -9,-17 Q-15,-17 -17.5,-12 Z" fill="#d6d6de" ${st}/>
<circle cx="-9" cy="-23.5" r="4.2" fill="#d6d6de" ${st}/>
<circle cx="-12.4" cy="-11" r="2.6" fill="#fff" stroke="${INK}" stroke-width="1.2"/><circle cx="-5.6" cy="-11" r="2.6" fill="#fff" stroke="${INK}" stroke-width="1.2"/><path d="M-9.8,-11 h1.6" stroke="${INK}" stroke-width="1.2"/>
<path d="M-15,-15.5 l4,1.2 M-3,-15.5 l-4,1.2" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>
<path d="M-12,-5.5 q3,-1.6 6,0" stroke="${INK}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
<path d="M2,2 L14,-6" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>
<path d="M30,-26 L14,10" stroke="#8a5a2e" stroke-width="3.6" stroke-linecap="round"/>
<circle cx="15" cy="-6" r="3.2" fill="#f2c9a0" ${st}/>
<path d="M15,6 L4,22 L26,24 L20,9 Z" fill="#e3c25e" ${st}/>
<path d="M14,10 L8,22 M17,11 L14,23 M19,11 L20,23" stroke="#a8862a" stroke-width="1.2"/>
<path d="M14,10 L20,11" stroke="#c0392b" stroke-width="2.4"/>
<path d="M34,-2 h8 M32,4 h10 M35,10 h6" stroke="${INK}" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>`,
  mugunghwa: () => `
<ellipse cx="0" cy="22" rx="44" ry="3.5" fill="#3a2a17" opacity="0.15"/>
<rect x="-34" y="-4" width="36" height="26" rx="1.5" fill="#f7e3c4" ${st}/>
<path d="M-38,-2 L-16,-22 L6,-2 Z" fill="#e06a6a" ${st}/>
<path d="M-23,22 V9 A7,7 0 0 1 -9,9 V22 Z" fill="#7a4f2e" ${st}/>
<path d="M-16,-12 c-2.4,-3 -6.4,-0.4 0,4 c6.4,-4.4 2.4,-7 0,-4 z" fill="#fff" stroke="${INK}" stroke-width="1"/>
<rect x="-31" y="2" width="8" height="5" rx="1" fill="#fff" stroke="${INK}" stroke-width="1"/>
<path d="M8,15 Q8,22 17,22 Q26,22 26,15 Z" fill="#e65f7a" ${st}/><ellipse cx="17" cy="15" rx="9" ry="2.6" fill="#a86b3c" ${st}/>
<circle cx="14" cy="13.8" r="1.5" fill="#7a4a24"/><circle cx="18" cy="13.4" r="1.5" fill="#7a4a24"/><circle cx="21" cy="14.4" r="1.4" fill="#7a4a24"/>
<path d="M28,15 Q28,22 36,22 Q44,22 44,15 Z" fill="#5b8fc7" ${st}/><ellipse cx="36" cy="15" rx="8" ry="2.4" fill="#bfe3f5" ${st}/>
<path d="M30,-6 c-3.6,-4.5 -9.6,-0.6 0,6 c9.6,-6.6 3.6,-10.5 0,-6 z" fill="#ff5c7a" ${st}/>
<path d="M14,-14 c-2.4,-3 -6.4,-0.4 0,4 c6.4,-4.4 2.4,-7 0,-4 z" fill="#ff8fa3" stroke="${INK}" stroke-width="1.2"/>`,
};

// 묶음 아이콘(아늑한 곳: 방석 / 먹을거리: 생선뼈)
const TAGICON = {
  '아늑한 곳': (x, y) => `<g transform="translate(${f(x)},${f(y)})"><rect x="-4.6" y="-3.2" width="9.2" height="6.4" rx="2.6" fill="#e9787a" stroke="${INK}" stroke-width="0.9"/><circle cx="0" cy="0" r="1" fill="${INK}"/></g>`,
  먹을거리: (x, y) => `<g transform="translate(${f(x)},${f(y)})"><path d="M-4.5,0 H3 M-2.5,-2.2 V2.2 M-0.5,-2.6 V2.6 M1.5,-2.2 V2.2" stroke="${INK}" stroke-width="0.9" stroke-linecap="round"/><path d="M3,0 L5.2,-2.4 V2.4 Z" fill="${INK}"/><circle cx="-4.6" cy="0" r="1.1" fill="${INK}"/></g>`,
};

/** 명당 타일 앞면 (R = 100). 규칙 배지는 draw.mjs spotTile 과 같은 계산 */
function spotTileSvg(id) {
  const sp = SPOTS[id];
  const R = 100;
  const o = [];
  const cid = `spot-${id}-clip`;
  o.push(`<defs><clipPath id="${cid}"><polygon points="${hexPts(0, 0, R * 0.93)}"/></clipPath></defs>`);
  o.push(`<polygon points="${hexPts(0, 0, R - 2.5)}" fill="${sp.bg}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`);
  // 바닥 무늬(연하게)
  o.push(`<g clip-path="url(#${cid})" opacity="0.5"><ellipse cx="0" cy="-20" rx="70" ry="38" fill="#fffaf0" opacity="0.7"/>${[[-62, 30], [58, 36], [-40, 70], [40, -70], [-58, -40]].map(([x, y]) => `<g transform="translate(${x},${y})" fill="#ffffff" opacity="0.55"><ellipse cx="0" cy="2" rx="4" ry="3.4"/><circle cx="-4" cy="-3" r="1.6"/><circle cx="0" cy="-4.6" r="1.6"/><circle cx="4" cy="-3" r="1.6"/></g>`).join('')}</g>`);
  o.push(`<polygon points="${hexPts(0, 0, R * 0.9)}" fill="none" stroke="#fffaf0" stroke-width="2.6" stroke-dasharray="7 5" opacity="0.95"/>`);
  // 쥐구멍은 오른쪽(동) 줄에 배지가 둘이라 그림을 왼쪽으로 좁힌다
  o.push(`<g transform="translate(${id === 'kudzu' ? -13 : 0},${id === 'kudzu' ? -27 : -23}) scale(${id === 'kudzu' ? 0.8 : 0.96})">${ILL[id]()}</g>`);
  // 묶음 띠
  if (sp.tag) {
    o.push(`<g data-tag="${sp.tag}"><rect x="-23" y="-80" width="46" height="12" rx="6" fill="#fffaf0" stroke="${INK}" stroke-width="1.4"/>${TAGICON[sp.tag](-15.5, -74)}${T(5, -71.5, 7, sp.tag, { weight: 800 })}</g>`);
  }
  // 옆 칸 · 두 칸 앞 배지
  let center = 0;
  for (const [dq, dr, n] of sp.roots) {
    if (dq === 0 && dr === 0) {
      center = n;
      continue;
    }
    const [x, y] = px(dq, dr, 1);
    const len = Math.hypot(x, y);
    const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
    const far = dist === 2;
    // 같은 방향에 옆 칸과 두 칸 앞이 함께 있으면(쥐구멍) 0.66R 한 자리에 겹치므로, 같은 줄 위에 안(0.40R)·밖(0.70R)으로 나눈다
    const unit = (q, r) => {
      const k = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
      return `${q / k},${r / k}`;
    };
    const shared = sp.roots.some(([q2, r2]) => (q2 || r2) && (q2 !== dq || r2 !== dr) && unit(q2, r2) === unit(dq, dr));
    const d = shared ? R * (far ? 0.7 : 0.34) : R * 0.66;
    const bx = (x / len) * d;
    const by = (y / len) * d;
    const rr = shared ? R * (far ? 0.13 : 0.12) : R * (far ? 0.19 : 0.17);
    if (shared && far) {
      // 옆 칸 → 두 칸 앞 이 한 줄임을 보여 주는 화살표 (두 원 사이)
      const ux = x / len;
      const uy = y / len;
      const a0 = R * 0.34 + R * 0.12 + 1; // 흰 원 가장자리
      const a1 = d - rr - 1.2; // 노란 원 가장자리
      const vx = -uy;
      const vy = ux;
      const p = (t, s) => `${f(ux * t + vx * s)},${f(uy * t + vy * s)}`;
      o.push(`<path data-arrow="${dq},${dr}" d="M${p(a0, -4.5)} L${p(a1, 0)} L${p(a0, 4.5)} Z" fill="${INK}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`);
    }
    o.push(`<g data-badge="side" data-dq="${dq}" data-dr="${dr}" data-n="${n}" data-far="${far}"><circle cx="${f(bx)}" cy="${f(by + 1.6)}" r="${f(rr)}" fill="#3a2a17" opacity="0.25"/><circle cx="${f(bx)}" cy="${f(by)}" r="${f(rr)}" fill="${far ? '#ffe066' : '#ffffff'}" stroke="${INK}" stroke-width="3"/>${T(bx, by + rr * 0.4, rr * 1.15, far ? `»${n}` : `${n}`, { weight: 900 })}</g>`);
  }
  // 가운데: 고양이 얼굴 배지
  const cr = R * 0.2;
  const by = R * 0.26;
  o.push(`<g data-badge="center" data-n="${center}"><path d="M${f(-cr * 0.92)},${f(by - cr * 0.4)} L${f(-cr * 0.78)},${f(by - cr * 1.32)} L${f(-cr * 0.2)},${f(by - cr * 0.92)} Z M${f(cr * 0.92)},${f(by - cr * 0.4)} L${f(cr * 0.78)},${f(by - cr * 1.32)} L${f(cr * 0.2)},${f(by - cr * 0.92)} Z" fill="${INK}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M${f(-cr * 0.7)},${f(by - cr * 0.62)} L${f(-cr * 0.68)},${f(by - cr * 1.05)} L${f(-cr * 0.36)},${f(by - cr * 0.84)} Z M${f(cr * 0.7)},${f(by - cr * 0.62)} L${f(cr * 0.68)},${f(by - cr * 1.05)} L${f(cr * 0.36)},${f(by - cr * 0.84)} Z" fill="#f4a7a3"/><circle cx="0" cy="${f(by)}" r="${f(cr)}" fill="${INK}" stroke="#fffaf0" stroke-width="1.6"/>${T(0, by + cr * 0.42, cr * 1.2, `${center}`, { fill: '#fff', weight: 900 })}<path d="M${f(-cr * 1.05)},${f(by + cr * 0.15)} l${f(-cr * 0.45)},${f(-cr * 0.08)} M${f(-cr * 1.05)},${f(by + cr * 0.4)} l${f(-cr * 0.42)},${f(cr * 0.1)} M${f(cr * 1.05)},${f(by + cr * 0.15)} l${f(cr * 0.45)},${f(-cr * 0.08)} M${f(cr * 1.05)},${f(by + cr * 0.4)} l${f(cr * 0.42)},${f(cr * 0.1)}" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/></g>`);
  // 이름 · 능력
  const lowBadge = sp.roots.some(([q, r]) => r > 0 && q < 0); // 왼쪽 아래 배지가 있으면 이름을 오른쪽으로 비킨다
  o.push(T(lowBadge ? 16 : 0, 64, sp.name.length > 5 ? 12.5 : 13.5, sp.name, { weight: 900, extra: ' data-label="name"' }));
  if (sp.mark) {
    const w = sp.mark.length * 8.4 + 12;
    o.push(`<g data-label="mark"><rect x="${f(-w / 2)}" y="70" width="${f(w)}" height="13" rx="6.5" fill="${INK}"/>${T(0, 79.6, 8.6, sp.mark, { fill: '#fff', weight: 800 })}</g>`);
  }
  const label = sp.mark ? `${sp.name} · ${sp.mark}` : sp.name;
  return svg('-100 -100 200 200', o.join('\n'), `명당 타일 — ${label}`);
}

function spotBackSvg() {
  const o = [];
  o.push(`<defs><clipPath id="spot-back-clip"><polygon points="${hexPts(0, 0, 95)}"/></clipPath></defs>`);
  o.push(`<polygon points="${hexPts(0, 0, 97.5)}" fill="#9a6a43" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`);
  const paws = [];
  for (let r = -4; r <= 4; r++)
    for (let q = -4; q <= 4; q++) {
      const x = 26 * (q + r / 2);
      const y = 22.5 * r;
      if (Math.hypot(x, y) < 44 || Math.hypot(x, y) > 110) continue;
      paws.push(`<g transform="translate(${f(x)},${f(y)}) rotate(${(q * 37 + r * 23) % 40 - 20})" fill="#f6dfc0" opacity="0.32"><ellipse cx="0" cy="2.2" rx="4.4" ry="3.8"/><circle cx="-4.6" cy="-3" r="1.8"/><circle cx="-1.6" cy="-5.4" r="1.8"/><circle cx="1.6" cy="-5.4" r="1.8"/><circle cx="4.6" cy="-3" r="1.8"/></g>`);
    }
  o.push(`<g clip-path="url(#spot-back-clip)">${paws.join('')}</g>`);
  o.push(`<polygon points="${hexPts(0, 0, 88)}" fill="none" stroke="#f6dfc0" stroke-width="2.4" stroke-dasharray="7 5"/>`);
  o.push(`<circle cx="0" cy="0" r="42" fill="#f6dfc0" stroke="${INK}" stroke-width="3"/>`);
  o.push(`<circle cx="0" cy="0" r="36" fill="none" stroke="#9a6a43" stroke-width="1.4" stroke-dasharray="3 3"/>`);
  o.push(`<g transform="translate(0,-8)"><path d="M-17,-4 L-14,-22 L-4,-14 Z M17,-4 L14,-22 L4,-14 Z" fill="${INK}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><ellipse cx="0" cy="-2" rx="19" ry="15" fill="${INK}"/><ellipse cx="-7" cy="-3" rx="3" ry="4" fill="#ffd34d"/><ellipse cx="7" cy="-3" rx="3" ry="4" fill="#ffd34d"/><ellipse cx="-7" cy="-3" rx="1.2" ry="3.2" fill="${INK}"/><ellipse cx="7" cy="-3" rx="1.2" ry="3.2" fill="${INK}"/><path d="M-1.6,3 h3.2 l-1.6,1.8 z" fill="#f4a7a3"/></g>`);
  o.push(T(0, 26, 13, '냥냥 골목', { weight: 900 }));
  o.push(T(0, -60, 9, '명당', { fill: '#f6dfc0', weight: 900, extra: ' letter-spacing="2"' }));
  return svg('-100 -100 200 200', o.join('\n'), '명당 타일 뒷면');
}

// ---------------------------------------------------------------------------
// 지형 · 아지트 · 고양이 토큰
// ---------------------------------------------------------------------------
function terrainSvg(kind) {
  const t = TERRAIN[kind];
  const cid = `terrain-${kind}-clip`;
  const o = [`<defs><clipPath id="${cid}"><polygon points="${hexPts(0, 0, 100)}"/></clipPath></defs>`];
  o.push(`<polygon points="${hexPts(0, 0, 100)}" fill="${t.fill}"/>`);
  const g = [];
  if (kind === 'empty') {
    // 보도블록: 엇갈린 벽돌 줄
    for (let r = 0; r < 12; r++) {
      const y = -100 + r * 18;
      g.push(`<path d="M-100,${y} H100" stroke="#d2c4ac" stroke-width="2"/>`);
      for (let x = -110 + (r % 2) * 18; x < 110; x += 36) g.push(`<path d="M${x},${y} v18" stroke="#d2c4ac" stroke-width="2"/>`);
    }
    g.push(`<g fill="#d8cbb4" opacity="0.8"><circle cx="-42" cy="-34" r="2"/><circle cx="52" cy="22" r="1.6"/><circle cx="-12" cy="58" r="1.8"/><circle cx="30" cy="-62" r="1.4"/></g>`);
  } else if (kind === 'fertile') {
    g.push(`<circle cx="0" cy="0" r="78" fill="#fff0b8" opacity="0.7"/>`);
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6;
      g.push(`<path d="M${f(Math.cos(a) * 30)},${f(Math.sin(a) * 30)} L${f(Math.cos(a - 0.12) * 110)},${f(Math.sin(a - 0.12) * 110)} L${f(Math.cos(a + 0.12) * 110)},${f(Math.sin(a + 0.12) * 110)} Z" fill="#ffd45e" opacity="0.45"/>`);
    }
    g.push(`<g transform="translate(0,-62)"><circle r="9" fill="#ffb627" stroke="#d98a12" stroke-width="2"/>${[0, 1, 2, 3, 4, 5, 6, 7].map((k) => { const a = (k * Math.PI) / 4; return `<path d="M${f(Math.cos(a) * 12.5)},${f(Math.sin(a) * 12.5)} L${f(Math.cos(a) * 17)},${f(Math.sin(a) * 17)}" stroke="#ffb627" stroke-width="3" stroke-linecap="round"/>`; }).join('')}</g>`);
  } else if (kind === 'pond') {
    for (let r = 0; r < 7; r++) {
      const y = -88 + r * 30;
      const x0 = -120 + (r % 2) * 24;
      g.push(`<path d="M${x0},${y} q12,-8 24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0" stroke="#e3f4fb" stroke-width="3.4" fill="none" stroke-linecap="round" opacity="0.9"/>`);
    }
    g.push(`<g fill="#a8d8ee" stroke="#6aaed0" stroke-width="1.4"><ellipse cx="-50" cy="40" rx="9" ry="5"/><ellipse cx="54" cy="-30" rx="7" ry="4"/></g>`);
  } else if (kind === 'rock') {
    g.push(`<g fill="#a3a3a3">${[[-50, -40], [-20, -70], [40, -50], [62, 10], [30, 60], [-40, 50], [-70, 10], [0, 30], [10, -20]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3"/><circle cx="${x + 8}" cy="${y + 5}" r="2"/>`).join('')}</g>`);
    // 위·아래 경고 띠
    for (const yy of [-80, 62]) {
      g.push(`<g><rect x="-100" y="${yy}" width="200" height="18" fill="#ffd34d"/>${Array.from({ length: 14 }, (_, i) => `<path d="M${-104 + i * 16},${yy + 18} l9,-18 h8 l-9,18 z" fill="#2f2f35"/>`).join('')}<rect x="-100" y="${yy}" width="200" height="18" fill="none" stroke="#6b6b6b" stroke-width="1.6"/></g>`);
    }
    g.push(`<g transform="translate(0,-4)"><rect x="-26" y="30" width="52" height="7" rx="2" fill="#8a4a10" stroke="${INK}" stroke-width="2"/><path d="M-17,30 L-5,-36 H5 L17,30 Z" fill="#f28c28" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M-12,4 H12 L14,14 H-14 Z M-8,-18 H8 L9.5,-10 H-9.5 Z" fill="#fff"/></g>`);
    g.push(T(0, 54, 13, '출입 금지', { fill: '#4a4a4a', weight: 900 }));
  }
  o.push(`<g clip-path="url(#${cid})">${g.join('')}</g>`);
  o.push(`<polygon points="${hexPts(0, 0, 99)}" fill="none" stroke="#a89878" stroke-width="2"/>`);
  return svg('-100 -100 200 200', o.join('\n'), `골목 칸 — ${t.name}`);
}

function hideoutSvg(seat) {
  const o = [];
  const dark = seat === 1;
  o.push(`<polygon points="${hexPts(0, 0, 99)}" fill="${SEAT_LIGHT[seat]}" stroke="#a89878" stroke-width="2"/>`);
  o.push(`<polygon points="${hexPts(0, 0, 84)}" fill="${SEAT[seat]}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`);
  o.push(`<polygon points="${hexPts(0, 0, 76)}" fill="none" stroke="${dark ? '#6a6a72' : SEAT_LIGHT[seat]}" stroke-width="2" stroke-dasharray="6 4"/>`);
  // 상자집
  o.push(`<ellipse cx="0" cy="40" rx="46" ry="6" fill="#000" opacity="0.18"/>`);
  o.push(`<path d="M-38,38 V-6 L0,-40 L38,-6 V38 Z" fill="#e2b783" stroke="${INK}" stroke-width="3.4" stroke-linejoin="round"/>`);
  o.push(`<path d="M-46,-2 L0,-46 L46,-2" fill="none" stroke="${SEAT_DARK[seat]}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M-46,-2 L0,-46 L46,-2" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>`);
  o.push(`<path d="M-22,38 V12 A22,22 0 0 1 22,12 V38 Z" fill="#3b2a1c"/>`);
  o.push(catHead(seat, 17, { x: 0, y: 22 }));
  o.push(`<path d="M-38,38 H38" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>`);
  o.push(`<g transform="translate(26,-14)" fill="${INK}" opacity="0.55"><ellipse cx="0" cy="2" rx="4" ry="3.4"/><circle cx="-4" cy="-3" r="1.6"/><circle cx="0" cy="-4.6" r="1.6"/><circle cx="4" cy="-3" r="1.6"/></g>`);
  o.push(T(0, 66, 16, '아지트', { fill: dark ? '#ffffff' : INK, weight: 900 }));
  return svg('-100 -100 200 200', o.join('\n'), `${SEAT_NAME[seat]} 아지트`);
}

function catTokenSvg(seat) {
  const o = [];
  o.push(`<circle cx="0" cy="2.5" r="46" fill="#000" opacity="0.2"/>`);
  o.push(`<circle cx="0" cy="0" r="46" fill="${SEAT_DARK[seat]}" stroke="#1a1a1a" stroke-width="2.5"/>`);
  o.push(`<circle cx="0" cy="-1.5" r="41" fill="${SEAT_LIGHT[seat]}"/>`);
  o.push(`<circle cx="0" cy="-1.5" r="41" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.5"/>`);
  o.push(catHead(seat, 30, { y: 6 }));
  return svg('-50 -50 100 100', o.join('\n'), `고양이 토큰 — ${SEAT_NAME[seat]}`);
}

// ---------------------------------------------------------------------------
// 소문 카드
// ---------------------------------------------------------------------------
const MINE = SEAT[0];
function miniHex(x, y, r, fill, { cat = false, stroke = '#5a4630' } = {}) {
  let s = `<polygon points="${hexPts(x, y, r)}" fill="${fill}" stroke="${stroke}" stroke-width="${f(r * 0.06)}" stroke-linejoin="round"/>`;
  if (fill === TERRAIN.pond.fill) s += `<path d="M${f(x - r * 0.5)},${f(y)} q${f(r * 0.25)},${f(-r * 0.18)} ${f(r * 0.5)},0 t${f(r * 0.5)},0" stroke="#e3f4fb" stroke-width="${f(r * 0.08)}" fill="none" stroke-linecap="round"/>`;
  if (fill === TERRAIN.fertile.fill) s += `<circle cx="${f(x)}" cy="${f(y - r * 0.5)}" r="${f(r * 0.13)}" fill="#ffb627"/>`;
  if (cat) s += catHead(0, r * 0.46, { x, y: y + r * 0.08 });
  return s;
}
function hexGrid(cx, cy, r, cells) {
  const w = r * SQ3;
  return cells.map(([q, rr, fill, cat]) => miniHex(cx + w * (q + rr / 2), cy + 1.5 * r * rr, r, fill, { cat })).join('');
}
const E = TERRAIN.empty.fill;
const SEVEN = [[0, 0], [1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [-1, 1]];
function goalArt(g) {
  const cx = 315;
  const cy = 360;
  if (g.spots) {
    const n = g.spots.length;
    if (n === 1) {
      return `<polygon points="${hexPts(cx, cy, 150)}" fill="${SPOTS[g.spots[0]].bg}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/><polygon points="${hexPts(cx, cy, 136)}" fill="none" stroke="#fffaf0" stroke-width="4" stroke-dasharray="12 8"/><g transform="translate(${cx},${cy + 4}) scale(2.7)">${ILL[g.spots[0]]()}</g>`;
    }
    let s = '';
    if (g.id === 'forest') {
      // 아늑한 곳 3개가 서로 맞닿은 무리(평상 · 종이 상자 · 평상)
      const R = 100;
      const w = R * SQ3;
      const pos = [[cx - w / 2, cy + 60, 'oak'], [cx + w / 2, cy + 60, 'pine'], [cx, cy - 90, 'oak']];
      for (const [x, y, id] of pos)
        s += `<polygon points="${hexPts(x, y, R)}" fill="${SPOTS[id].bg}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><g transform="translate(${f(x)},${f(y + 4)}) scale(1.75)">${ILL[id]()}</g>`;
      return s;
    }
    const sc = n === 3 ? 1.55 : 2.0;
    const R = n === 3 ? 92 : 118;
    const pos = n === 3 ? [[cx - 172, cy + 48], [cx, cy - 64], [cx + 172, cy + 48]] : [[cx - 128, cy], [cx + 128, cy]];
    g.spots.forEach((id, i) => {
      const [x, y] = pos[i];
      s += `<polygon points="${hexPts(x, y, R)}" fill="${SPOTS[id].bg}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/><g transform="translate(${x},${y + 4}) scale(${sc})">${ILL[id]()}</g>`;
    });
    return s;
  }
  const r = 62;
  switch (g.glyph) {
    case 'pond':
      return hexGrid(cx, cy, r, SEVEN.map(([q, rr]) => (q === 0 && rr === 0 ? [q, rr, TERRAIN.pond.fill] : [q, rr, (q + rr) % 2 ? MINE : E, !!((q + rr) % 2)])));
    case 'blob':
      return hexGrid(cx, cy, r, SEVEN.map(([q, rr]) => [q, rr, q + rr <= 0 || rr === 0 ? MINE : E, q + rr <= 0 || rr === 0]));
    case 'line': {
      const cells = [];
      for (let q = -2; q <= 2; q++) cells.push([q, 0, MINE, true]);
      cells.push([0, -1, E], [1, -1, E], [-1, 1, E], [0, 1, E]);
      return hexGrid(cx, cy, 52, cells) + `<path d="M${cx - 290},${cy} H${cx + 290}" stroke="${INK}" stroke-width="5" stroke-dasharray="2 12" stroke-linecap="round" opacity="0.7"/>`;
    }
    case 'sun':
      return hexGrid(cx, cy, r, SEVEN.map(([q, rr]) => {
        const sun = (q === 0 && rr === 0) || (q === 1 && rr === -1) || (q === -1 && rr === 1);
        return [q, rr, sun ? TERRAIN.fertile.fill : E, sun];
      }));
    case 'edge': {
      // 보드 가장자리: 바깥 줄이 내 칸, 그 바깥은 보드 밖(점선)
      const cells = [];
      for (let q = -2; q <= 2; q++) cells.push([q, 1, MINE, true]);
      for (let q = -2; q <= 2; q++) cells.push([q, 0, E]);
      for (let q = -1; q <= 2; q++) cells.push([q, -1, E]);
      const yEdge = cy + 30 + 1.5 * 52 + 52 + 10;
      return hexGrid(cx - 26, cy - 30, 52, cells) + `<path d="M${cx - 280},${yEdge} H${cx + 280}" stroke="#c0692f" stroke-width="7" stroke-dasharray="18 12" stroke-linecap="round"/>`;
    }
    case 'center':
      return `<polygon points="${hexPts(cx, cy, r * 3.05)}" fill="#fff0d0" stroke="none"/>` + hexGrid(cx, cy, r, SEVEN.map(([q, rr]) => {
        const m = (q === 0 && rr === 0) || (q + 2 * rr) % 3 === 0 || q === 1;
        return [q, rr, m ? MINE : E, m];
      })) + `<g transform="translate(${cx},${cy - r * 2.95}) scale(0.8)"><path d="M-34,10 L-40,-22 L-17,-6 L0,-30 L17,-6 L40,-22 L34,10 Z" fill="#ffd34d" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/></g>`;
    case 'tiles': {
      let s = '';
      const rr2 = 30;
      const piece = (px0, py0, mine) => {
        const outline = `<polygon points="${hexPts(px0, py0, rr2 * 2.9)}" fill="none" stroke="#c0692f" stroke-width="4" stroke-dasharray="10 7" transform="rotate(30 ${px0} ${py0})"/>`;
        return outline + hexGrid(px0, py0, rr2, SEVEN.map(([q, r3]) => [q, r3, q === mine[0] && r3 === mine[1] ? MINE : E, q === mine[0] && r3 === mine[1]]));
      };
      s += piece(cx - 150, cy - 70, [1, 0]);
      s += piece(cx + 150, cy - 70, [0, 1]);
      s += piece(cx, cy + 105, [-1, 0]);
      return s;
    }
    case 'five': {
      const ids = ['oak', 'grass', 'fern', 'lotus', 'mugunghwa'];
      let s = '';
      ids.forEach((id, i) => {
        const a = Math.PI + (i * Math.PI) / 4;
        const x = cx + Math.cos(a) * 200;
        const y = cy + 70 + Math.sin(a) * 170;
        s += `<polygon points="${hexPts(x, y, 62)}" fill="${SPOTS[id].bg}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><g transform="translate(${f(x)},${f(y + 3)}) scale(1.08)">${ILL[id]()}</g>`;
      });
      s += `<circle cx="${cx}" cy="${cy + 92}" r="70" fill="${INK}"/>${T(cx, cy + 116, 62, '5종', { fill: '#fff', weight: 900 })}`;
      return s;
    }
    default:
      return '';
  }
}
function goalCardSvg(g) {
  const band = g.reserve ? '#4f9d5a' : '#c0692f';
  const bandDark = g.reserve ? '#2f6b3a' : '#8a4a1e';
  const cid = `goal-${g.id}-clip`;
  const o = [];
  o.push(`<defs><clipPath id="${cid}"><rect x="8" y="8" width="614" height="864" rx="38"/></clipPath></defs>`);
  o.push(`<rect x="4" y="4" width="622" height="872" rx="42" fill="#fffaf0" stroke="${INK}" stroke-width="8"/>`);
  o.push(`<g clip-path="url(#${cid})">`);
  o.push(`<rect x="0" y="0" width="630" height="150" fill="${band}"/>`);
  o.push(`<path d="M0,150 Q80,170 160,150 T320,150 T480,150 T640,150 V0 H0 Z" fill="${band}"/>`);
  o.push(`<path d="M0,150 Q80,170 160,150 T320,150 T480,150 T640,150" fill="none" stroke="${bandDark}" stroke-width="5"/>`);
  o.push(`<g fill="#ffffff" opacity="0.14">${[[60, 40], [575, 112], [520, 30]].map(([x, y]) => `<g transform="translate(${x},${y}) scale(2.2)"><ellipse cx="0" cy="2" rx="4" ry="3.4"/><circle cx="-4" cy="-3" r="1.6"/><circle cx="0" cy="-4.6" r="1.6"/><circle cx="4" cy="-3" r="1.6"/></g>`).join('')}</g>`);
  o.push(`</g>`);
  if (g.reserve) o.push(`<g><rect x="34" y="28" width="92" height="36" rx="18" fill="#fffaf0" stroke="${INK}" stroke-width="3"/>${T(80, 55, 23, '단골', { fill: bandDark, weight: 900 })}</g>`);
  o.push(T(315, 120, g.name.length > 6 ? 58 : 64, g.name, { fill: '#ffffff', weight: 900, extra: ` stroke="${bandDark}" stroke-width="3" paint-order="stroke"` }));
  // 그림 영역은 제목 띠 아래(y 186~576)에 따로 두고 잘라, 띠 글자를 가리지 않는다
  o.push(`<defs><clipPath id="goal-${g.id}-art"><rect x="24" y="186" width="582" height="390" rx="20"/></clipPath></defs>`);
  o.push(`<g data-art="1" clip-path="url(#goal-${g.id}-art)"><g transform="translate(315,384) scale(0.86) translate(-315,-360)">${goalArt(g)}</g></g>`);
  const lines = g.rule.split('\n');
  o.push(`<rect x="40" y="590" width="550" height="130" rx="24" fill="#f6ead6"/>`);
  lines.forEach((ln, i) => o.push(T(315, 642 + i * 56, 42, ln, { weight: 700 })));
  if (g.sub) o.push(T(315, 760, 30, g.sub, { fill: '#8a6a50', weight: 700 }));
  o.push(T(315, 848, g.pts.length > 3 ? 96 : 110, g.pts, { fill: band, weight: 900, extra: ` stroke="${INK}" stroke-width="3" paint-order="stroke"` }));
  return svg('0 0 630 880', o.join('\n'), `소문 카드 — ${g.name}`);
}
function goalBackSvg() {
  const o = [];
  o.push(`<defs><clipPath id="goal-back-clip"><rect x="8" y="8" width="614" height="864" rx="38"/></clipPath></defs>`);
  o.push(`<rect x="4" y="4" width="622" height="872" rx="42" fill="#5b3a29" stroke="${INK}" stroke-width="8"/>`);
  const paws = [];
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 6; c++) {
      const x = 40 + c * 110 + (r % 2) * 55;
      const y = 40 + r * 92;
      paws.push(`<g transform="translate(${x},${y}) rotate(${((r * 7 + c * 13) % 5) * 9 - 18}) scale(2.6)"><ellipse cx="0" cy="2" rx="4" ry="3.4"/><circle cx="-4" cy="-3" r="1.6"/><circle cx="0" cy="-4.6" r="1.6"/><circle cx="4" cy="-3" r="1.6"/></g>`);
    }
  o.push(`<g clip-path="url(#goal-back-clip)" fill="#f6dfc0" opacity="0.12">${paws.join('')}</g>`);
  o.push(`<rect x="34" y="34" width="562" height="812" rx="28" fill="none" stroke="#f6dfc0" stroke-width="4" stroke-dasharray="16 10"/>`);
  // 말풍선 + 귀
  o.push(`<g transform="translate(315,400)"><path d="M-150,-120 L-120,-205 L-60,-140 Z M150,-120 L120,-205 L60,-140 Z" fill="#f6dfc0" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/><path d="M-200,-40 C-200,-120 -120,-150 0,-150 C120,-150 200,-120 200,-40 C200,50 120,80 20,80 L-30,140 L-20,78 C-130,72 -200,40 -200,-40 Z" fill="#f6dfc0" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>${T(0, 0, 120, '소문', { weight: 900 })}<g fill="${INK}"><circle cx="-60" cy="34" r="7"/><circle cx="0" cy="40" r="7"/><circle cx="60" cy="34" r="7"/></g></g>`);
  o.push(T(315, 720, 52, '냥냥 골목', { fill: '#f6dfc0', weight: 900 }));
  return svg('0 0 630 880', o.join('\n'), '소문 카드 뒷면');
}

// ---------------------------------------------------------------------------
// 로고 · 표지
// ---------------------------------------------------------------------------
function logoInner() {
  // 가로 900 × 300 기준
  const o = [];
  o.push(`<g transform="translate(118,40)"><path d="M0,70 L14,0 L58,42 Z M150,70 L136,0 L92,42 Z" fill="${SEAT[0]}" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/><path d="M18,52 L24,22 L42,40 Z M132,52 L126,22 L108,40 Z" fill="#f4a7a3"/></g>`);
  o.push(T(450, 222, 168, '냥냥 골목', { fill: '#ffffff', weight: 900, extra: ` stroke="${INK}" stroke-width="34" stroke-linejoin="round" paint-order="stroke" textLength="760" lengthAdjust="spacingAndGlyphs"` }));
  o.push(T(450, 222, 168, '냥냥 골목', { fill: SEAT[0], weight: 900, extra: ` stroke="#ffffff" stroke-width="10" stroke-linejoin="round" paint-order="stroke" textLength="760" lengthAdjust="spacingAndGlyphs"` }));
  o.push(`<path d="M818,250 C870,250 880,190 846,170" stroke="${INK}" stroke-width="22" fill="none" stroke-linecap="round"/><path d="M818,250 C870,250 880,190 846,170" stroke="${SEAT[0]}" stroke-width="10" fill="none" stroke-linecap="round"/>`);
  o.push(`<g transform="translate(450,270)">${[-1, 0, 1].map((i) => `<g transform="translate(${i * 60},0) scale(2.2)" fill="${[SEAT[2], SEAT[1], SEAT[0]][i + 1]}"><ellipse cx="0" cy="2" rx="4" ry="3.4"/><circle cx="-4" cy="-3" r="1.6"/><circle cx="0" cy="-4.6" r="1.6"/><circle cx="4" cy="-3" r="1.6"/></g>`).join('')}</g>`);
  return o.join('\n');
}
function logoSvg() {
  return svg('0 0 900 300', logoInner(), '냥냥 골목 로고');
}
function coverSvg() {
  const o = [];
  o.push(`<defs><linearGradient id="cover-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc98f"/><stop offset="0.65" stop-color="#ffeccc"/></linearGradient><clipPath id="cover-clip"><rect width="1600" height="1000"/></clipPath></defs>`);
  o.push(`<g clip-path="url(#cover-clip)">`);
  o.push(`<rect width="1600" height="1000" fill="url(#cover-sky)"/>`);
  o.push(`<circle cx="1230" cy="250" r="84" fill="#fff4cf" opacity="0.9"/>`);
  // 먼 집들
  o.push(`<g fill="#f2c9a0" stroke="#d9a878" stroke-width="3">${[[420, 430, 180, 230], [610, 470, 150, 200], [770, 440, 170, 230], [950, 480, 150, 190], [1100, 450, 160, 220]].map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/><path d="M${x - 14},${y} L${x + w / 2},${y - 50} L${x + w + 14},${y} Z" fill="#e8a885"/>`).join('')}</g>`);
  o.push(`<g fill="#fff3d6" stroke="#d9a878" stroke-width="2">${[[450, 480], [520, 480], [640, 520], [800, 490], [870, 490], [980, 530], [1130, 500], [1200, 500]].map(([x, y]) => `<rect x="${x}" y="${y}" width="36" height="36" rx="3"/>`).join('')}</g>`);
  // 전봇대 · 전깃줄
  o.push(`<path d="M0,250 Q560,330 1110,230 M0,290 Q560,370 1110,270 M1110,230 Q1360,290 1600,250" stroke="#5a4630" stroke-width="3" fill="none"/>`);
  o.push(`<rect x="1098" y="200" width="22" height="600" fill="#9a8a78" stroke="${INK}" stroke-width="5"/><rect x="1060" y="226" width="100" height="14" rx="4" fill="#8a7a68" stroke="${INK}" stroke-width="4"/>`);
  // 왼쪽 한옥 + 지붕
  o.push(`<rect x="-20" y="380" width="470" height="430" fill="#f5e6c8" stroke="${INK}" stroke-width="6"/>`);
  o.push(`<path d="M-20,470 H450 M110,380 V810 M300,380 V810" stroke="#8a5a2e" stroke-width="12"/>`);
  o.push(`<rect x="150" y="510" width="120" height="120" fill="#fff8e6" stroke="#8a5a2e" stroke-width="8"/><path d="M210,510 V630 M150,570 H270 M180,510 V630 M240,510 V630 M150,540 H270 M150,600 H270" stroke="#8a5a2e" stroke-width="3"/>`);
  let tiles = '';
  for (let x = -20; x <= 470; x += 22) tiles += `M${x},300 Q${x + 4},350 ${x + 2},392 `;
  o.push(`<path d="M-60,380 Q-30,392 0,392 L40,300 H410 L450,392 Q480,392 520,374 Q500,410 470,412 H-20 Q-50,412 -60,380 Z" fill="#7b8794" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`);
  o.push(`<path d="${tiles}" stroke="#5a6572" stroke-width="3" fill="none" clip-path="url(#cover-roofclip)"/>`);
  o.push(`<path d="M20,290 H430 Q450,290 458,276 Q448,312 420,312 H40 Q12,312 2,276 Q10,290 20,290 Z" fill="#4f5966" stroke="${INK}" stroke-width="6"/>`);
  o.push(sittingCat(2, 50, { x: 330, y: 300, look: 1 }));
  o.push(sittingCat(2, 38, { x: 150, y: 300, look: 1, flip: true }));
  // 오른쪽 담장 + 파란 대문
  o.push(`<rect x="1150" y="470" width="470" height="350" fill="#eadbc6" stroke="${INK}" stroke-width="6"/>`);
  o.push(`<path d="M1150,540 H1620 M1150,610 H1620 M1150,680 H1620 M1150,750 H1620" stroke="#d2bfa6" stroke-width="3"/>`);
  o.push(`<rect x="1300" y="520" width="200" height="300" fill="#6f9bc4" stroke="${INK}" stroke-width="6"/><path d="M1400,520 V820" stroke="${INK}" stroke-width="5"/><path d="M1320,560 H1380 M1420,560 H1480 M1320,600 H1380 M1420,600 H1480" stroke="#4f7aa3" stroke-width="5"/><circle cx="1388" cy="680" r="6" fill="#ffd34d" stroke="${INK}" stroke-width="3"/><circle cx="1412" cy="680" r="6" fill="#ffd34d" stroke="${INK}" stroke-width="3"/>`);
  o.push(`<g fill="#6fbf55" stroke="#2e6b22" stroke-width="3">${[[1170, 480], [1200, 500], [1230, 476], [1250, 510], [1530, 480], [1560, 505], [1590, 478], [1180, 530], [1545, 540]].map(([x, y]) => `<path d="M${x},${y} c-14,-4 -16,-20 0,-26 c16,6 14,22 0,26 z"/>`).join('')}</g>`);
  // 바닥 골목길
  o.push(`<path d="M0,800 H1600 V1000 H0 Z" fill="#e6dccb" stroke="${INK}" stroke-width="6"/>`);
  let pave = '';
  for (let i = 0; i < 6; i++) pave += `M0,${830 + i * 34} H1600 `;
  for (let x = -800; x <= 2400; x += 110) pave += `M800,700 L${x},1100 `;
  o.push(`<path d="${pave}" stroke="#d2c4ac" stroke-width="3" clip-path="url(#cover-groundclip)"/>`);
  o.push(`<defs><clipPath id="cover-groundclip"><rect x="0" y="803" width="1600" height="200"/></clipPath><clipPath id="cover-roofclip"><path d="M-60,380 Q-30,392 0,392 L40,300 H410 L450,392 Q480,392 520,374 Q500,410 470,412 H-20 Q-50,412 -60,380 Z"/></clipPath></defs>`);
  // 평상
  o.push(`<ellipse cx="800" cy="935" rx="330" ry="22" fill="#3a2a17" opacity="0.18"/>`);
  o.push(`<g stroke="${INK}" stroke-width="6" stroke-linejoin="round"><rect x="510" y="820" width="30" height="110" rx="5" fill="#8a5a2e"/><rect x="1060" y="820" width="30" height="110" rx="5" fill="#8a5a2e"/><rect x="785" y="820" width="30" height="100" rx="5" fill="#8a5a2e"/><path d="M470,808 L540,730 H1060 L1130,808 Z" fill="#dca866"/><rect x="470" y="806" width="660" height="34" rx="6" fill="#b67b3e"/></g>`);
  o.push(`<path d="M640,730 L612,808 M740,730 L728,808 M860,730 L872,808 M960,730 L988,808" stroke="#a8743c" stroke-width="5"/>`);
  o.push(`<g transform="translate(1000,770)"><ellipse cx="0" cy="14" rx="70" ry="14" fill="#fff" stroke="${INK}" stroke-width="5"/><path d="M-50,8 A50,50 0 0 1 50,8 Z" fill="#7bbf5a" stroke="${INK}" stroke-width="5"/><path d="M-40,8 A40,40 0 0 1 40,8 Z" fill="#f2565b"/><path d="M-18,-6 l3,6 M0,-20 v7 M18,-6 l-3,6" stroke="#2a1d14" stroke-width="6" stroke-linecap="round"/></g>`);
  o.push(sittingCat(0, 72, { x: 700, y: 792, look: 1 }));
  o.push(loafCat(0, 58, { x: 860, y: 800, flip: true }));
  // 오른쪽 앞 종이 상자 + 턱시도냥
  o.push(`<g stroke="${INK}" stroke-width="6" stroke-linejoin="round"><ellipse cx="1280" cy="965" rx="150" ry="16" fill="#3a2a17" opacity="0.18" stroke="none"/><path d="M1150,830 L1176,792 H1384 L1410,830 Z" fill="#a8743c"/></g>`);
  o.push(catHead(1, 70, { x: 1280, y: 800, look: -1 }));
  o.push(`<g stroke="${INK}" stroke-width="6" stroke-linejoin="round"><path d="M1150,836 L1100,796 L1130,772 L1176,820 Z" fill="#d7a76c"/><path d="M1410,836 L1460,796 L1430,772 L1384,820 Z" fill="#d7a76c"/><rect x="1150" y="830" width="260" height="130" rx="8" fill="#e2b783"/></g>`);
  o.push(`<rect x="1262" y="833" width="36" height="124" fill="#f3dcae" opacity="0.85"/>`);
  o.push(`<ellipse cx="1245" cy="836" rx="20" ry="13" fill="#fff" stroke="${INK}" stroke-width="5"/><ellipse cx="1315" cy="836" rx="20" ry="13" fill="#fff" stroke="${INK}" stroke-width="5"/>`);
  o.push(sittingCat(1, 56, { x: 1500, y: 985, look: -1, flip: true }));
  // 왼쪽 앞 캣닢 화분
  o.push(`<g transform="translate(150,930) scale(3.2)">${ILL.dandelion()}</g>`);
  // 발자국
  o.push(`<g fill="#c9b99f">${[[380, 960, -20], [430, 935, -10], [480, 965, 0], [1050, 975, 10]].map(([x, y, a]) => `<g transform="translate(${x},${y}) rotate(${a}) scale(2.6)"><ellipse cx="0" cy="2" rx="4" ry="3.4"/><circle cx="-4" cy="-3" r="1.6"/><circle cx="0" cy="-4.6" r="1.6"/><circle cx="4" cy="-3" r="1.6"/></g>`).join('')}</g>`);
  // 눈치 표시
  o.push(`<g stroke="${INK}" stroke-width="5" stroke-linecap="round"><path d="M430,110 l14,-22 M452,124 l22,-12 M415,92 l2,-26" transform="translate(-20,70)"/><path d="M1180,640 l-14,-22 M1158,652 l-22,-12"/><path d="M610,520 l-10,-24 M632,512 l4,-26"/></g>`);
  o.push(`</g>`);
  // 로고
  o.push(`<g transform="translate(395,10) scale(0.9)">${logoInner()}</g>`);
  o.push(`<rect x="3" y="3" width="1594" height="994" rx="18" fill="none" stroke="${INK}" stroke-width="6"/>`);
  return svg('0 0 1600 1000', o.join('\n'), '냥냥 골목 표지');
}

// ---------------------------------------------------------------------------
for (const id of SPOT_IDS) save(`spot-${id}.svg`, spotTileSvg(id));
save('spot-back.svg', spotBackSvg());
for (const g of GOALS) save(`goal-${g.id}.svg`, goalCardSvg(g));
save('goal-back.svg', goalBackSvg());
for (const k of ['empty', 'fertile', 'pond', 'rock']) save(`terrain-${k}.svg`, terrainSvg(k));
for (const s of [0, 1, 2]) save(`hideout-${s}.svg`, hideoutSvg(s));
for (const s of [0, 1, 2]) save(`cat-${s}.svg`, catTokenSvg(s));
save('cover.svg', coverSvg());
save('logo.svg', logoSvg());
writeFileSync(new URL('./manifest.json', import.meta.url), JSON.stringify(Object.keys(files), null, 1));
console.log(Object.keys(files).length, 'files');
