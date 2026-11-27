/**
 * 규칙서·기획안 그림을 만든다. submission/figures/*.svg
 *   node submission/tools/build-figures.mjs
 * 판 그림(준비·진행 모습)은 dump-state.ts 로 실제 규칙 엔진(실험실 엔진, 정본과 같음)에서 뽑은 판을 그린다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEAT_NAME, SPOTS, SPOT_IDS, TERRAIN, board, catStack, catToken, spotTile, text, wrap } from './draw.mjs';
import { GOALS, goalCard } from './goals.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..', '..');
const OUT = join(HERE, '..', 'figures');
mkdirSync(OUT, { recursive: true });

function dump(players, seed, plays) {
  const tsx = join(GAME, '..', '..', 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
  const out = execFileSync(tsx, [join(HERE, 'dump-state.ts'), String(players), String(seed), String(plays)], { cwd: GAME, encoding: 'utf8', shell: process.platform === 'win32' });
  return JSON.parse(out);
}
const save = (name, svg) => writeFileSync(join(OUT, `${name}.svg`), svg);
const caption = (x, y, s, t, o) => text(x, y, s, t, o);

/** 작은 장면용 칸 목록: 원점 기준 반지름 rad 육각 */
function patch(rad, extra = {}) {
  const cells = [];
  for (let q = -rad; q <= rad; q++)
    for (let r = Math.max(-rad, -q - rad); r <= Math.min(rad, -q + rad); r++) {
      const k = `${q},${r}`;
      cells.push({ q, r, terrain: 'empty', tile: 0, entrance: -1, seat: -1, count: 0, plant: null, rotation: 0, ...(extra[k] ?? {}) });
    }
  return { cells };
}
const scene = (st, R, opts = {}) => board(st, R, { tileEdges: false, pad: 1.05, ...opts });

// ---------------------------------------------------------------------------
// 진행 모습 (표지·기획안)
// ---------------------------------------------------------------------------
function tableScene(st, W) {
  const R = 46;
  const b = board(st, R, {});
  const [bx, by, bw, bh] = b.bbox;
  const side = 330;
  const parts = [`<rect x="${bx - 30}" y="${by - 30}" width="${bw + side + 60}" height="${bh + 60}" rx="24" fill="#c8a477"/>`];
  parts.push(`<rect x="${bx - 30}" y="${by - 30}" width="${bw + side + 60}" height="${bh + 60}" rx="24" fill="url(#wood)" opacity="0.35"/>`);
  parts.push(b.svg);
  const sx = bx + bw + 20;
  let y = by + 20;
  parts.push(caption(sx + side / 2 - 20, y, 22, '소문 카드', { fill: '#3b2a18' }));
  y += 14;
  st.goals.forEach((g, i) => parts.push(goalCard(g, sx + 4 + i * 104, y, 96, 134)));
  y += 175;
  parts.push(caption(sx + side / 2 - 20, y, 22, '펼친 타일', { fill: '#3b2a18' }));
  st.market.forEach((m, i) => parts.push(spotTile(m, sx + 70 + i * 120, y + 62, 52, { label: false, compact: true })));
  y += 150;
  parts.push(`<path d="M${sx + 210},${y + 70} q-10,-60 25,-70 q35,10 25,70 z" fill="#b5835a" stroke="#6b4423" stroke-width="3"/><path d="M${sx + 222},${y + 4} q13,-10 26,0" stroke="#6b4423" stroke-width="4" fill="none"/>`);
  parts.push(caption(sx + 235, y + 92, 16, `주머니 ${st.bag}개`, { fill: '#3b2a18' }));
  for (let s = 0; s < st.players; s++) {
    parts.push(caption(sx + 60, y + 20 + s * 60, 16, `${SEAT_NAME[s]} 쉬는 고양이`, { fill: '#3b2a18' }));
    const n = st.supply[s];
    for (let k = 0; k < n; k++) parts.push(catToken(sx + 8 + (k % 8) * 20, y + 40 + s * 60 - Math.floor(k / 8) * 8, 10, s));
  }
  const vb = [bx - 30, by - 30, bw + side + 60, bh + 60];
  const defs = `<defs><pattern id="wood" width="40" height="400" patternUnits="userSpaceOnUse"><path d="M0,0 q20,200 0,400 M20,0 q-15,200 10,400" stroke="#8a6440" stroke-width="2" fill="none"/></pattern></defs>`;
  return wrap(defs + parts.join(''), vb, W);
}
const mid = dump(2, 7, 14);
save('table2', tableScene(mid, 1100));
// 표지: 클로드 디자인 표지 그림(art/cover.svg)이 있으면 그것을 쓴다
if (existsSync(join(HERE, '..', 'art', 'cover.svg'))) save('cover', readFileSync(join(HERE, '..', 'art', 'cover.svg'), 'utf8'));
else save('cover', tableScene(mid, 1100));
const mid3 = dump(3, 12, 18);
save('table3', tableScene(mid3, 1100));

// ---------------------------------------------------------------------------
// 구성물
// ---------------------------------------------------------------------------
{
  const R = 34;
  const p = [];
  // 골목 조각 하나 (7칸)
  const piece = patch(1, { '1,0': { terrain: 'pond' }, '-1,1': { terrain: 'fertile' } });
  const b1 = board(piece, R, { pad: 1.05 });
  p.push(`<g transform="translate(110,110)">${b1.svg}</g>`, caption(110, 215, 15, '골목 조각 12장'));
  const hide = patch(1, { '0,0': { entrance: 0 }, '0,-1': { terrain: 'fertile' } });
  p.push(`<g transform="translate(310,110)">${board(hide, R, { pad: 1.05 }).svg}</g>`, caption(310, 215, 15, '아지트 조각 3장'));
  p.push(spotTile('pine', 470, 100, 40), spotTile('oak', 560, 100, 40), caption(515, 215, 15, '명당 타일 45개'));
  for (let s = 0; s < 3; s++) p.push(catStack(650 + s * 42, 130, 2 + s, s, 16));
  p.push(caption(693, 215, 15, '고양이 토큰 54개'));
  p.push(goalCard('big-garden', 760, 40, 92, 128), caption(806, 215, 15, '소문 카드 16장'));
  p.push(`<path d="M905,160 q-12,-70 28,-82 q40,12 28,82 z" fill="#b5835a" stroke="#6b4423" stroke-width="3"/><path d="M919,84 q14,-12 28,0" stroke="#6b4423" stroke-width="4" fill="none"/>`, caption(933, 215, 15, '천 주머니'));
  p.push(`<circle cx="1020" cy="125" r="24" fill="#f6c343" stroke="#8a6a10" stroke-width="3"/><path d="M1004,128 h32" stroke="#8a6a10" stroke-width="3"/><circle cx="1020" cy="138" r="5" fill="#8a6a10"/><path d="M1012,100 q8,-10 16,0" stroke="#d33" stroke-width="5" fill="none"/>`, caption(1020, 215, 15, '대장 방울'));
  save('components', wrap(p.join(''), [0, 20, 1070, 210], 1000));
}

// ---------------------------------------------------------------------------
// 지형 4종
// ---------------------------------------------------------------------------
{
  const R = 40;
  const p = [];
  ['empty', 'fertile', 'pond', 'rock'].forEach((t, i) => {
    const st = { cells: [{ q: 0, r: 0, terrain: t, tile: 0, entrance: -1, seat: -1, count: 0, plant: null }] };
    p.push(`<g transform="translate(${70 + i * 150},55)">${board(st, R, { tileEdges: false }).svg}</g>`, caption(70 + i * 150, 125, 16, TERRAIN[t].name));
  });
  const st = { cells: [{ q: 0, r: 0, terrain: 'empty', tile: 0, entrance: 1, seat: -1, count: 0, plant: null }] };
  p.push(`<g transform="translate(670,55)">${board(st, R, { tileEdges: false }).svg}</g>`, caption(670, 125, 16, '아지트'));
  save('terrain', wrap(p.join(''), [0, 0, 740, 135], 620));
}

// ---------------------------------------------------------------------------
// 준비 (2인·3인)
// ---------------------------------------------------------------------------
{
  const s2 = dump(2, 3, 0);
  const s3 = dump(3, 5, 0);
  const R = 22;
  const b2 = board(s2, R, {});
  const b3 = board(s3, R, {});
  const p = [];
  p.push(`<g transform="translate(${-b2.bbox[0] + 10},${-b3.bbox[1] - b2.bbox[1] * 0 + (b3.bbox[3] - b2.bbox[3]) / 2 - b3.bbox[3] / 2 + b3.bbox[3] / 2})">${b2.svg}</g>`);
  const off3 = b2.bbox[2] + 40;
  p.push(`<g transform="translate(${off3 - b3.bbox[0]},${-b3.bbox[1]})">${b3.svg}</g>`);
  p.push(caption(b2.bbox[2] / 2 + 10, b3.bbox[3] + 22, 16, '2인: 조각 7장 (아지트 2)'));
  p.push(caption(off3 + b3.bbox[2] / 2, b3.bbox[3] + 22, 16, '3인: 조각 13장 (아지트 3)'));
  save('setup', wrap(p.join(''), [0, 0, off3 + b3.bbox[2] + 10, b3.bbox[3] + 34], 900));
}

// ---------------------------------------------------------------------------
// 놓을 수 있는 칸
// ---------------------------------------------------------------------------
{
  const st = patch(2, {
    '-2,1': { entrance: 0 },
    '-1,1': { seat: 0, count: 1 },
    '-1,0': { seat: 0, count: 2, plant: 'grass' },
    '0,0': { seat: 0, count: 1 },
    '1,0': { seat: 1, count: 2 },
    '1,-1': { terrain: 'pond' },
    '0,1': { terrain: 'rock' },
    '2,-1': { seat: 1, count: 1 },
  });
  const marks = { '-1,1': 'ok', '0,0': 'ok', '-2,2': 'ok', '-1,2': 'ok', '0,-1': 'ok', '-1,-1': 'ok', '-2,0': 'ok', '1,0': 'no', '-1,0': 'no', '2,0': 'no', '1,1': 'no', '2,-2': 'no', '0,-2': 'no', '1,-2': 'no', '2,-1': 'no', '0,2': 'no' };
  const b = scene(st, 34, { marks });
  const legend = `${caption(0, 0, 0, '')}`;
  save('where', wrap(b.svg + legend, b.bbox, 520));
}

// ---------------------------------------------------------------------------
// 타일 읽는 법 (지붕을 두 방향으로)
// ---------------------------------------------------------------------------
{
  const p = [];
  p.push(spotTile('fern', 90, 100, 70));
  p.push(caption(90, 200, 15, '지붕 타일'));
  const mk = (rotation, ox) => {
    const st = patch(2, { '0,0': { plant: 'fern', rotation } });
    const marks = {};
    for (const [dq, dr] of SPOTS.fern.roots.map(([q, r]) => {
      let a = q;
      let b = r;
      for (let i = 0; i < rotation; i++) [a, b] = [-b, a + b];
      return [a, b];
    }))
      marks[`${dq},${dr}`] = '#c0392b';
    const b = scene(st, 22, { marks, spotLabels: false });
    return `<g transform="translate(${ox},100)">${b.svg}</g>`;
  };
  p.push(mk(0, 300), caption(300, 200, 15, '이렇게 놓으면'));
  p.push(mk(1, 520), caption(520, 200, 15, '한 칸 돌려 놓으면'));
  save('tile-read', wrap(p.join(''), [0, 10, 630, 200], 620));
}

// ---------------------------------------------------------------------------
// 고양이 모이기 예시 (치즈냥이 평상을 놓는다)
// ---------------------------------------------------------------------------
{
  const base = {
    '-1,1': { seat: 0, count: 1 },
    '0,1': { seat: 0, count: 2 },
    '1,0': { seat: 1, count: 1 },
    '1,-1': { seat: 1, count: 3, plant: 'pine', rotation: 0 },
    '-1,0': {},
  };
  const before = patch(2, { ...base, '0,0': { plant: 'oak', rotation: 0 } });
  const after = patch(2, { ...base, '0,0': { plant: 'oak', rotation: 0, seat: 0, count: 2 }, '1,0': { seat: 0, count: 1 }, '-1,0': { seat: 0, count: 2 } });
  const R = 30;
  const b1 = scene(before, R, { labels: { '0,0': '2', '1,0': '2', '-1,0': '2' }, marks: { '0,0': '#c0392b', '1,0': '#c0392b', '-1,0': '#c0392b' } });
  const b2 = scene(after, R);
  const w = b1.bbox[2];
  const p = [`<g transform="translate(${-b1.bbox[0]},${-b1.bbox[1]})">${b1.svg}</g>`, `<g transform="translate(${w + 70 - b2.bbox[0]},${-b2.bbox[1]})">${b2.svg}</g>`];
  p.push(`<path d="M${w + 12},${b1.bbox[3] / 2} h44 l-10,-10 M${w + 56},${b1.bbox[3] / 2} l-10,10" stroke="#3b2a18" stroke-width="5" fill="none"/>`);
  p.push(caption(w / 2, b1.bbox[3] + 18, 15, '평상을 놓는다 (점선 칸에 빨간 숫자만큼 온다)'));
  p.push(caption(w + 70 + w / 2, b1.bbox[3] + 18, 15, '턱시도냥 1마리 쫓아내고 치즈냥 1마리 앉음'));
  save('example', wrap(p.join(''), [0, 0, 2 * w + 70, b1.bbox[3] + 30], 900));
}

// ---------------------------------------------------------------------------
// 쉬는 고양이가 모자랄 때 (치즈냥 쉬는 고양이 2마리, 종이 상자: 3+1+1 = 5마리 필요)
// ---------------------------------------------------------------------------
{
  const base = { '-1,1': { seat: 0, count: 3 }, '0,1': { seat: 0, count: 1, plant: 'grass', rotation: 3 }, '1,1': { seat: 0, count: 1 }, '-2,0': { seat: 1, count: 2 } };
  const before = patch(2, { ...base, '0,0': { plant: 'pine' } });
  const after = patch(2, { ...base, '-1,1': { seat: 0, count: 1 }, '1,1': { seat: 0, count: 0 }, '0,0': { plant: 'pine', seat: 0, count: 3 }, '1,0': { seat: 0, count: 1 }, '-1,0': { seat: 0, count: 1 } });
  const R = 30;
  const b1 = scene(before, R, { labels: { '-1,1': '①②', '1,1': '③' }, marks: { '0,0': '#c0392b', '1,0': '#c0392b', '-1,0': '#c0392b' } });
  const b2 = scene(after, R);
  const w = b1.bbox[2];
  const p = [`<g transform="translate(${-b1.bbox[0]},${-b1.bbox[1]})">${b1.svg}</g>`, `<g transform="translate(${w + 70 - b2.bbox[0]},${-b2.bbox[1]})">${b2.svg}</g>`];
  p.push(`<path d="M${w + 12},${b1.bbox[3] / 2} h44 l-10,-10 M${w + 56},${b1.bbox[3] / 2} l-10,10" stroke="#3b2a18" stroke-width="5" fill="none"/>`);
  p.push(caption(w / 2, b1.bbox[3] + 18, 14, '쉬는 고양이 2 + 데려올 3 (점선 칸 제외)'));
  p.push(caption(w + 70 + w / 2, b1.bbox[3] + 18, 14, '예) ①② 높이 쌓인 칸, ③ 끝 칸 — 데려올 칸은 내가 고른다'));
  save('short', wrap(p.join(''), [0, 0, 2 * w + 70, b1.bbox[3] + 30], 900));
}

// ---------------------------------------------------------------------------
// 명당 9종
// ---------------------------------------------------------------------------
{
  const p = [];
  SPOT_IDS.forEach((id, i) => p.push(spotTile(id, 70 + (i % 5) * 140, 75 + Math.floor(i / 5) * 145, 62)));
  save('spots', wrap(p.join(''), [0, 5, 700, 290], 640));
}

// ---------------------------------------------------------------------------
// 소문 카드
// ---------------------------------------------------------------------------
{
  const p = [];
  GOALS.forEach((g, i) => p.push(goalCard(g.id, 10 + (i % 8) * 108, 10 + Math.floor(i / 8) * 150, 100, 140)));
  save('goals', wrap(p.join(''), [0, 0, 874, 310], 860));
}
console.log('figures →', OUT);
