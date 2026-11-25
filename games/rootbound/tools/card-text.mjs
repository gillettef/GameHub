/**
 * 카드 디자인 SVG 를 지금 규칙(notes/Rules.md 7·8절, notes/Cards.md)에 맞춘다 (2026-10-16 오프라인판).
 *   node scripts/card-text.mjs
 * - 식물 카드: 뿌리 모양 그림(심은 칸 중심 315,548), 카드 번호(n / 09), 꽃·나무·보호구역 배지, 효과 문구를 다시 쓴다.
 *   그림(아트)·이야기 문구는 그대로 둔다. 뿌리 그림 칸 크기·색·글꼴은 원래 카드 디자인 규칙을 그대로 쓴다.
 * - 목표 카드: 바뀐 점수·문구·번호만 바꾼다.
 * 수치는 test/fixtures/specs.json(npm run fixtures)에서 읽는다. 같은 입력이면 여러 번 돌려도 결과가 같다.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const specs = JSON.parse(readFileSync(join(root, 'test/fixtures/specs.json'), 'utf8'));
const cards = join(root, 'public/cards');

const FONT_C = `'Barlow Condensed','IBM Plex Sans KR','Arial Narrow',sans-serif`;
const FONT_B = `'Barlow','IBM Plex Sans KR',sans-serif`;
const FLOWER = ['dandelion', 'lotus', 'mugunghwa'];
const TREE = ['oak', 'pine'];
const RESERVE = new Set(specs.goals.filter((g) => g.species).map((g) => g.species));

/** 카드 효과 문구 (한 줄 22자 안팎). Cards.md 와 같다 */
const CARD_LINES = {
  grass: ['이어진 세 칸에 넓게 깐다.'],
  oak: ['양옆 두 칸을 두껍게 굳힌다.'],
  pine: ['심은 칸은 거의 뺏기지 않는다.'],
  kudzu: ['한 줄로 두 칸 앞까지 파고든다.'],
  fern: ['바로 옆은 건너뛰고', '멀리 세 칸에 퍼진다.'],
  dandelion: ['심은 뒤 두 칸 안 아무 칸에', '큐브 1개를 날린다.'],
  lotus: ['연못과 맞닿은 빈 칸이면', '어디든 심을 수 있다.'],
  mushroom: ['맞닿은 6칸에서 남의 큐브를', '2개씩 걷어낸다.'],
  mugunghwa: ['끝날 때 내 땅 위에 있으면 +1점.'],
};

const DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];
const f1 = (v) => String(Math.round(v * 10) / 10);
const hex = (cx, cy, R) => {
  const w = (R * Math.sqrt(3)) / 2;
  return [
    [cx, cy - R],
    [cx + w, cy - R / 2],
    [cx + w, cy + R / 2],
    [cx, cy + R],
    [cx - w, cy + R / 2],
    [cx - w, cy - R / 2],
  ]
    .map(([x, y]) => `${f1(x)},${f1(y)}`)
    .join(' ');
};

/** 뿌리 그림 (원래 디자인: 한 칸 거리면 큰 칸 R27, 두 칸 거리면 작은 칸 R19) */
function diagram(sp) {
  const cells = new Map();
  const put = (q, r, kind, label) => cells.set(`${q},${r}`, { q, r, kind, label });
  if (sp.wither) for (const [q, r] of DIRS) put(q, r, 'minus', `−${sp.wither}`);
  for (const s of sp.roots) put(s.dq, s.dr, s.dq === 0 && s.dr === 0 ? 'self' : 'plus', String(s.n));
  if (sp.seed && !cells.has('0,-2')) put(0, -2, 'seed', String(sp.seed));
  const far = [...cells.values()].some((c) => (Math.abs(c.q) + Math.abs(c.r) + Math.abs(c.q + c.r)) / 2 >= 2);
  const R = far ? 19 : 27;
  const big = !far;
  const xs = Math.sqrt(3) * R;
  const ys = 1.5 * R;
  const cx = 315;
  const cy = 548;
  const pos = (c) => [cx + xs * (c.q + c.r / 2), cy + ys * c.r];
  const list = [...cells.values()];
  let out = '';
  for (const c of list) {
    const [x, y] = pos(c);
    out += `<polygon points="${hex(x, y, R)}" fill="#1d2d3d" stroke="#1d2d3d" stroke-width="10" stroke-linejoin="round"/>`;
  }
  const textAttr = (size, fill) => `font-family="${FONT_C}" font-size="${size}" font-weight="700" fill="${fill}" text-anchor="middle"`;
  const cell = R * (big ? 25.4 / 27 : 17.4 / 19);
  const inner = R * (big ? 22 / 27 : 14 / 19);
  for (const c of list) {
    const [x, y] = pos(c);
    if (c.kind === 'self') {
      out += `<polygon points="${hex(x, y, cell)}" fill="#5980a6" stroke="#5980a6" stroke-width="1.2"/>`;
      out += `<polygon points="${hex(x, y, inner)}" fill="none" stroke="#fff" stroke-width=".8" opacity=".55"/>`;
      out += `<text x="${f1(x)}" y="${f1(y + (big ? 8.1 : 5.7))}" ${textAttr(big ? 25.65 : 18.05, '#fff')}>${c.label}</text>`;
    } else if (c.kind === 'plus') {
      out += `<polygon points="${hex(x, y, cell)}" fill="#d6ebff" stroke="#94bce3" stroke-width="1.2"/>`;
      out += `<text x="${f1(x)}" y="${f1(y + (big ? 6.5 : 4.6))}" ${textAttr(big ? 18.9 : 13.3, '#1d2d3d')}>${c.label}</text>`;
    } else if (c.kind === 'minus') {
      out += `<polygon points="${hex(x, y, cell)}" fill="#1d2d3d" stroke="#b5d9fd" stroke-width="1.2" stroke-dasharray="3 2.5"/>`;
      out += `<text x="${f1(x)}" y="${f1(y + (big ? 6.5 : 4.6))}" ${textAttr(big ? 18.9 : 13.3, '#d6ebff')}>${c.label}</text>`;
    } else {
      out += `<polygon points="${hex(x, y, cell)}" fill="#2c455d" stroke="#b5d9fd" stroke-width="1.2" stroke-dasharray="3 2.5"/>`;
      out += `<text x="${f1(x)}" y="${f1(y + (big ? 6.5 : 4.6))}" ${textAttr(big ? 18.9 : 13.3, '#d6ebff')}>${c.label}</text>`;
    }
  }
  const half = Math.max(...list.map((c) => Math.abs(pos(c)[0] - cx))) + (R * Math.sqrt(3)) / 2 + 17.6;
  out += `<path d="M44,548H${f1(cx - half)}M${f1(cx + half)},548H586" stroke="#416180" stroke-width="1"/>`;
  return out;
}

const BADGE_TEXT = /<path d="M[\d.]+,(?:58|92)H585L592,(?:65|99)V(?:79|113)L585,(?:86|120)H[\d.]+L[\d.]+,(?:79|113)V(?:65|99)Z"[^>]*\/><text[^>]*>(?:보호구역 대상|꽃|나무)<\/text>/g;

function badge(label, row, reserve) {
  const w = label.length * 13.3 + 26.3; // 원래 배지 폭: 꽃 39.3, 나무 52.6, 보호구역 대상 109.7
  const x0 = 592 - w;
  const y = 58 + row * 34;
  const fill = reserve ? 'fill="#1d2d3d" stroke="#b5d9fd"' : 'fill="#5980a6" stroke="#5980a6"';
  return (
    `<path d="M${f1(x0 + 7)},${y}H585L592,${y + 7}V${y + 21}L585,${y + 28}H${f1(x0 + 7)}L${f1(x0)},${y + 21}V${y + 7}Z" ${fill} stroke-width="1"/>` +
    `<text x="${f1(x0 + w / 2)}" y="${y + 19}" font-family="${FONT_C}" font-size="14" font-weight="600" fill="#fff" text-anchor="middle" letter-spacing="0.5">${label}</text>`
  );
}

function plantCard(sp, i) {
  const file = join(cards, 'plants', `${sp.id}.svg`);
  let s = readFileSync(file, 'utf8');
  const no = String(i + 1).padStart(2, '0');
  const total = String(specs.species.length).padStart(2, '0');
  // 번호
  s = s.replace(/(<text x="74" y="90\.1"[^>]*>)\d\d(<\/text>)/, `$1${no}$2`);
  s = s.replace(/(<text x="578" y="841"[^>]*>)\d\d \/ \d\d(<\/text>)/, `$1${no} / ${total}$2`);
  // 배지: 이름 줄(학명 text) 바로 뒤에 다시 넣는다
  s = s.replace(BADGE_TEXT, '');
  const latin = s.match(/<text x="120" y="126"[^>]*>[^<]*<\/text>/);
  if (!latin) throw new Error(`${sp.id}: 학명 줄을 찾지 못했습니다`);
  const labels = [];
  if (RESERVE.has(sp.id)) labels.push(['보호구역 대상', true]);
  if (FLOWER.includes(sp.id)) labels.push(['꽃', false]);
  if (TREE.includes(sp.id)) labels.push(['나무', false]);
  s = s.replace(latin[0], latin[0] + labels.map(([l, r], row) => badge(l, row, r)).join(''));
  // 뿌리 그림: 첫 받침 육각 ~ 가로 구분선
  const back = s.indexOf('fill="#1d2d3d" stroke="#1d2d3d" stroke-width="10"');
  const start = s.lastIndexOf('<polygon', back);
  const sepMatch = /<path d="M44,548H[\d.]+M[\d.]+,548H586" stroke="#416180" stroke-width="1"\/>/.exec(s);
  if (back < 0 || !sepMatch || sepMatch.index < start) throw new Error(`${sp.id}: 뿌리 그림 자리를 찾지 못했습니다`);
  s = s.slice(0, start) + diagram(sp) + s.slice(sepMatch.index + sepMatch[0].length);
  // 효과 문구 (font-size 27 줄)
  const re = /<text x="315" y="([\d.]+)" font-family="[^"]*" font-size="27" font-weight="600" fill="#fff" text-anchor="middle">[^<]*<\/text>/g;
  const old = [...s.matchAll(re)];
  if (!old.length) throw new Error(`${sp.id}: 효과 문구를 찾지 못했습니다`);
  const ys = old.map((m) => Number(m[1]));
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  const lines = CARD_LINES[sp.id];
  const newYs = lines.length === ys.length ? ys : lines.map((_, k) => mid + (k - (lines.length - 1) / 2) * 35.9);
  const text = lines
    .map((t, k) => `<text x="315" y="${f1(newYs[k])}" font-family="${FONT_B}" font-size="27" font-weight="600" fill="#fff" text-anchor="middle">${t}</text>`)
    .join('');
  const first = old[0];
  s = s.replace(re, '');
  s = s.slice(0, first.index) + text + s.slice(first.index);
  writeFileSync(file, s);
  return `${sp.id} ${no}/${total} 배지 ${labels.map((l) => l[0]).join('+') || '-'}`;
}

function goalCard(g, i) {
  const file = join(cards, 'goals', `${g.id}.svg`);
  let s = readFileSync(file, 'utf8');
  const no = String(i + 1).padStart(2, '0');
  s = s.replace(/GOAL · \d\d/, `GOAL · ${no}`);
  s = s.replace(/(<text x="[\d.]+" y="113\.2"[^>]*>)\d\d(<\/text>)/, `$1${no}$2`);
  writeFileSync(file, s);
  return `${g.id} ${no}`;
}

console.log(specs.species.map(plantCard).join('\n'));
console.log(specs.goals.map(goalCard).join('\n'));
