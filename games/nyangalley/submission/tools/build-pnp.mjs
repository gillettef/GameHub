/**
 * 인쇄용 프로토타입(프린트 앤 플레이) PDF. A4, 실제 크기(mm).
 *   node submission/tools/build-pnp.mjs  → submission/out/냥냥골목_프로토타입.pdf
 * submission/art/ 에 디자인 그림(spot-<id>.svg, goal-<id>.svg, terrain-*.svg, hideout-<n>.svg, cat-<n>.svg, *-back.svg)이
 * 있으면 그것을 쓰고, 없으면 draw.mjs·goals.mjs 의 벡터 그림을 쓴다.
 *
 * 크기: 보드 칸 변–변 36mm, 명당 타일 변–변 34mm, 소문 카드 63×88mm, 고양이 토큰 지름 16mm.
 * 골목 조각 12장의 지형은 정본 src/engine/data/tiles.ts(Rules.md 3.2)와 같다.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEAT, SEAT_NAME, SPOT_IDS, board, catToken, hexPoints, px, spotTile, text } from './draw.mjs';
import { GOALS, goalCard } from './goals.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUB = join(HERE, '..');
const ART = join(SUB, 'art');
const OUT = join(SUB, 'out');
mkdirSync(OUT, { recursive: true });
const SQ3 = Math.sqrt(3);

/** 디자인 그림이 있으면 <image> 로 넣는다 (x,y 왼쪽 위, w×h mm) */
function art(name, x, y, w, h) {
  const f = join(ART, `${name}.svg`);
  if (!existsSync(f)) return null;
  const b64 = readFileSync(f).toString('base64');
  return `<image href="data:image/svg+xml;base64,${b64}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
}
const hasArt = (name) => existsSync(join(ART, `${name}.svg`));

// 정본 골목 조각 (src/engine/data/tiles.ts): 칸 번호 0 = 가운데, 1~6 = 방향 0~5
const TILES = [
  [[1, 'pond']],
  [[1, 'pond'], [2, 'pond']],
  [[1, 'rock']],
  [[0, 'pond']],
  [[1, 'fertile']],
  [[1, 'fertile'], [4, 'fertile']],
  [[1, 'pond'], [4, 'fertile']],
  [[1, 'rock'], [3, 'fertile']],
  [[1, 'pond'], [2, 'pond'], [5, 'fertile']],
  [[0, 'fertile'], [3, 'rock']],
  [[2, 'pond'], [5, 'rock']],
  [],
];
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

const PAGE_W = 210;
const PAGE_H = 297;
const M = 10;
const page = (inner, title) =>
  `<section class="page"><svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}mm" height="${PAGE_H}mm" viewBox="0 0 ${PAGE_W} ${PAGE_H}">${inner}${title ? text(PAGE_W / 2, 7, 3.6, title, { fill: '#7a6a55', weight: 600 }) : ''}</svg></section>`;

/** 꼭짓점이 위인 육각 칸 하나 (지형 그림 또는 벡터) */
function cellArt(terrain, x, y, R, entrance = -1) {
  const name = entrance >= 0 ? `hideout-${entrance}` : `terrain-${terrain}`;
  if (hasArt(name)) {
    // 디자인 그림은 viewBox -100..100, 반지름 100 = 꼭짓점까지
    return art(name, x - R, y - R, 2 * R, 2 * R);
  }
  const st = { cells: [{ q: 0, r: 0, terrain, tile: 0, entrance, seat: -1, count: 0, plant: null }] };
  return `<g transform="translate(${x},${y}) scale(${R / 40})">${board(st, 40, { tileEdges: false }).svg}</g>`;
}

/** 골목 조각 한 장 (7칸). 가운데 (cx, cy) */
function piece(spec, cx, cy, R, entrance = -1) {
  const cells = [[0, 0], ...DIRS];
  const terr = new Array(7).fill('empty');
  for (const [slot, t] of spec) terr[slot] = t;
  let o = '';
  cells.forEach(([q, r], i) => {
    const [x, y] = px(q, r, R);
    const ent = i === 0 ? entrance : -1;
    o += cellArt(terr[i], cx + x, cy + y, R, ent);
  });
  // 자르는 선: 조각 바깥 테두리
  cells.forEach(([q, r]) => {
    const [x, y] = px(q, r, R);
    DIRS.forEach(([dq, dr], d) => {
      if (cells.some(([a, b]) => a === q + dq && b === r + dr)) return;
      const a1 = ((-60 * d - 30) * Math.PI) / 180;
      const a2 = ((-60 * d + 30) * Math.PI) / 180;
      o += `<line x1="${cx + x + R * Math.cos(a1)}" y1="${cy + y + R * Math.sin(a1)}" x2="${cx + x + R * Math.cos(a2)}" y2="${cy + y + R * Math.sin(a2)}" stroke="#222" stroke-width="0.35"/>`;
    });
  });
  return o;
}

/** 꽃 모양 조각을 빈틈없이 까는 격자에서 페이지 안에 들어가는 중심들. 원점을 옮겨 가며 가장 많이 들어가는 배치를 고른다 */
function flowerSlots(R) {
  const fits = (cx, cy) =>
    [[0, 0], ...DIRS].every(([dq, dr]) => {
      const [ex, ey] = px(dq, dr, R);
      return cx + ex - R * 0.87 >= M && cx + ex + R * 0.87 <= PAGE_W - M && cy + ey - R >= M + 4 && cy + ey + R <= PAGE_H - M;
    });
  let best = [];
  for (let ox = M; ox <= PAGE_W - M; ox += 3)
    for (let oy = M; oy <= PAGE_H - M; oy += 3) {
      const out = [];
      for (let a = -6; a <= 6; a++)
        for (let b = -6; b <= 6; b++) {
          const [x, y] = px(2 * a - b, a + 3 * b, R);
          if (fits(ox + x, oy + y)) out.push([ox + x, oy + y]);
        }
      if (out.length > best.length) best = out;
    }
  return best.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
}

/** 육각 타일을 빈틈없이 까는 자리 (변–변 d mm) */
function hexSlots(R, max) {
  const out = [];
  for (let r = -20; r <= 20; r++)
    for (let q = -20; q <= 20; q++) {
      const [x, y] = px(q, r, R);
      const cx = PAGE_W / 2 + x;
      const cy = PAGE_H / 2 + y;
      if (cx - R * 0.87 >= M && cx + R * 0.87 <= PAGE_W - M && cy - R >= M + 4 && cy + R <= PAGE_H - M) out.push([cx, cy]);
    }
  out.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  return out.slice(0, max);
}

const pages = [];

// 1. 골목 조각 12장 + 아지트 조각 3장
{
  const R = 36 / SQ3;
  const all = [...TILES.map((t) => ({ spec: t, ent: -1 })), ...[0, 1, 2].map((s) => ({ spec: [[1, 'fertile']], ent: s }))];
  let i = 0;
  while (i < all.length) {
    const slots = flowerSlots(R);
    let o = '';
    for (const [cx, cy] of slots) {
      if (i >= all.length) break;
      o += piece(all[i].spec, cx, cy, R, all[i].ent);
      i++;
    }
    pages.push(page(o, `골목 조각 · 아지트 조각 (칸 변–변 36mm) — 테두리를 따라 자른다`));
  }
}

// 2. 명당 타일 45개 (종마다 5개)
{
  const R = 34 / SQ3;
  const list = SPOT_IDS.flatMap((id) => [id, id, id, id, id]);
  let i = 0;
  while (i < list.length) {
    const slots = hexSlots(R, 99);
    let o = '';
    for (const [cx, cy] of slots) {
      if (i >= list.length) break;
      const id = list[i];
      o += art(`spot-${id}`, cx - R, cy - R, 2 * R, 2 * R) ?? spotTile(id, cx, cy, R);
      o += `<polygon points="${hexPoints(cx, cy, R)}" fill="none" stroke="#222" stroke-width="0.3"/>`;
      i++;
    }
    pages.push(page(o, `명당 타일 (변–변 34mm) — 9종 × 5개`));
  }
  // 뒷면 한 장 (양면 인쇄용)
  const slots = hexSlots(R, 99);
  let o = '';
  for (const [cx, cy] of slots.slice(0, 30)) {
    o += art('spot-back', cx - R, cy - R, 2 * R, 2 * R) ?? `<polygon points="${hexPoints(cx, cy, R)}" fill="#6b4f3a"/><text x="${cx}" y="${cy + 2}" font-size="5" text-anchor="middle" fill="#f6e6c8" font-weight="800">냥냥</text>`;
    o += `<polygon points="${hexPoints(cx, cy, R)}" fill="none" stroke="#222" stroke-width="0.3"/>`;
  }
  pages.push(page(o, `명당 타일 뒷면 (필요하면 양면 인쇄)`));
}

// 3. 소문 카드 16장 (63×88mm, 한 쪽 9장)
{
  const W = 63;
  const H = 88;
  const x0 = (PAGE_W - 3 * W) / 2;
  const y0 = 12;
  for (let p = 0; p * 9 < GOALS.length; p++) {
    let o = '';
    GOALS.slice(p * 9, p * 9 + 9).forEach((g, k) => {
      const x = x0 + (k % 3) * W;
      const y = y0 + Math.floor(k / 3) * H;
      o += art(`goal-${g.id}`, x, y, W, H) ?? goalCard(g.id, x + 1, y + 1, W - 2, H - 2);
      o += `<rect x="${x}" y="${y}" width="${W}" height="${H}" fill="none" stroke="#222" stroke-width="0.25"/>`;
    });
    pages.push(page(o, `소문 카드 (63×88mm)`));
  }
  let o = '';
  for (let k = 0; k < 9; k++) {
    const x = x0 + (k % 3) * W;
    const y = y0 + Math.floor(k / 3) * H;
    o += art('goal-back', x, y, W, H) ?? `<rect x="${x + 1}" y="${y + 1}" width="${W - 2}" height="${H - 2}" rx="4" fill="#c0692f"/><text x="${x + W / 2}" y="${y + H / 2}" font-size="8" text-anchor="middle" fill="#fff" font-weight="800">소문</text>`;
    o += `<rect x="${x}" y="${y}" width="${W}" height="${H}" fill="none" stroke="#222" stroke-width="0.25"/>`;
  }
  pages.push(page(o, `소문 카드 뒷면`));
}

// 4. 고양이 토큰 54개(3색 × 18) + 대장 방울 + 점수 기록지
{
  let o = '';
  const d = 16;
  for (let s = 0; s < 3; s++) {
    o += text(M, 20 + s * 48, 4, `${SEAT_NAME[s]} 18개`, { anchor: 'start', fill: '#3b2a18' });
    for (let k = 0; k < 18; k++) {
      const x = M + 9 + (k % 9) * 20;
      const y = 32 + s * 48 + Math.floor(k / 9) * 19;
      o += art(`cat-${s}`, x - d / 2, y - d / 2, d, d) ?? `<g transform="translate(${x},${y})">${catToken(0, 0, 7.2, s)}</g>`;
      o += `<circle cx="${x}" cy="${y}" r="${d / 2}" fill="none" stroke="#222" stroke-width="0.25"/>`;
    }
  }
  o += text(M, 172, 4, '대장 방울 (선 표시)', { anchor: 'start', fill: '#3b2a18' });
  o += `<circle cx="${M + 15}" cy="190" r="11" fill="#f6c343" stroke="#222" stroke-width="0.3"/><text x="${M + 15}" y="192" font-size="4" text-anchor="middle" font-weight="800">대장</text>`;
  // 점수 기록지
  const tx = 60;
  const ty = 168;
  o += text(tx, ty + 4, 4.2, '점수 기록지', { anchor: 'start', fill: '#3b2a18' });
  const rows = ['내 칸 (1칸 1점)', '소문 카드 1', '소문 카드 2', '소문 카드 3', '캣맘 급식소 (+1)', '합계'];
  const cw = [44, 30, 30, 30];
  rows.forEach((rname, i) => {
    const y = ty + 8 + i * 9;
    o += `<rect x="${tx}" y="${y}" width="${cw[0]}" height="9" fill="${i === 5 ? '#fff3e2' : '#fff'}" stroke="#555" stroke-width="0.25"/>`;
    o += text(tx + 2, y + 6, 3.4, rname, { anchor: 'start', weight: 600 });
    for (let s = 0; s < 3; s++) o += `<rect x="${tx + cw[0] + s * 30}" y="${y}" width="30" height="9" fill="#fff" stroke="#555" stroke-width="0.25"/>`;
  });
  for (let s = 0; s < 3; s++) {
    o += `<rect x="${tx + cw[0] + s * 30}" y="${ty + 2}" width="30" height="6" fill="${SEAT[s]}"/>`;
    o += text(tx + cw[0] + s * 30 + 15, ty + 6.3, 3.4, SEAT_NAME[s], { fill: s === 1 ? '#fff' : '#1a1a1a' });
  }
  // 차례 요약 카드
  const sy = 236;
  o += `<rect x="${M}" y="${sy}" width="${PAGE_W - 2 * M}" height="48" rx="3" fill="#fffaf0" stroke="#555" stroke-width="0.3"/>`;
  const lines = [
    '차례 요약 — 셋 중 하나만',
    '① 가져오기: 펼친 타일 1개(빈자리 바로 채움), 또는 주머니에서 2개 (손 최대 3개)',
    '② 명당 놓기: 손 1개를 내 칸, 또는 내 칸·아지트와 맞닿은 고양이 없는 칸에 원하는 방향으로 → 고양이 모이기',
    '③ 명당 부르기: 내 칸 위 명당 하나를 돌려 그 모양대로 고양이 모이기 (능력 없음)',
    '고양이 모이기: 쫓아내기(1마리가 1마리) → 앉히기(모자라면 이번에 앉힐 칸을 뺀 원하는 내 칸에서)',
    '라운드 끝: 쉬는 고양이가 가장 많은 사람이 다음 선 · 끝(2인 18 / 3인 15라운드): 내 칸 1점 + 소문 카드 3장 + 급식소',
  ];
  lines.forEach((l, i) => (o += text(M + 5, sy + 9 + i * 8.5, i === 0 ? 4.6 : 3.5, l, { anchor: 'start', weight: i === 0 ? 800 : 500 })));
  pages.push(page(o, `고양이 토큰(지름 16mm) · 대장 방울 · 점수 기록지 · 차례 요약`));
}

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 0; }
body { margin: 0; }
.page { width: 210mm; height: 297mm; page-break-after: always; overflow: hidden; }
.page:last-child { page-break-after: auto; }
svg text { font-family: Pretendard, 'Malgun Gothic', sans-serif; }
</style></head><body>${pages.join('')}</body></html>`;

const browser = await chromium.launch({ channel: 'chrome' });
const pg = await browser.newPage();
await pg.setContent(html, { waitUntil: 'load' });
await pg.waitForTimeout(500);
const out = join(OUT, '냥냥골목_프로토타입.pdf');
await pg.pdf({ path: out, format: 'A4', printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
await browser.close();
console.log(`saved ${out} (${pages.length}쪽, 디자인 그림 ${existsSync(ART) ? '있음' : '없음'})`);
