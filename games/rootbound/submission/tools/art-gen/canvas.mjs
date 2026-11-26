import { fileURLToPath } from 'node:url';
// art/*.svg 를 Design 캔버스 아트보드(.dc.html)에 인라인으로 넣는다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const SUB = fileURLToPath(new URL('../..', import.meta.url));
const ART = `${SUB}/art`;
const ROOT = new URL('../canvas/', import.meta.url);
const { SPOTS, SPOT_IDS, SEAT_NAME, TERRAIN } = await import(pathToFileURL(`${SUB}/tools/draw.mjs`).href);
const { GOALS } = await import(pathToFileURL(`${SUB}/tools/goals.mjs`).href);
mkdirSync(new URL('project/', ROOT), { recursive: true });

const inline = (name, w) => {
  let s = readFileSync(`${ART}/${name}.svg`, 'utf8');
  s = s.replace(/<title>.*?<\/title>\n?/, '');
  s = s.replace(/font-family="Pretendard, 'Malgun Gothic', sans-serif"/g, `font-family="Pretendard, 'Malgun Gothic', 'Noto Sans KR', sans-serif"`);
  s = s.replace(/<([a-zA-Z]+)([^<>]*?)\/>/g, '<$1$2></$1>');
  s = s.replace('<svg ', `<svg width="${w}" style="display: block; width: ${w}px; height: auto" `);
  return s.trim();
};
const cell = (name, label, w) =>
  `<figure style="margin: 0; display: flex; flex-direction: column; align-items: center; gap: 8px; width: ${w}px">${inline(name, w)}<figcaption style="display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center"><span style="font-size: 15px; font-weight: 700; color: #3b2a1c">${label}</span><span style="font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 11px; color: #7a6650">art/${name}.svg</span></figcaption></figure>`;

const page = (title, w, h, body) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&amp;family=JetBrains+Mono:wght@400&amp;display=swap">
<style>
body{margin:0}
a{color:#8a4a1e}a:hover{color:#5b3a29}
</style>
</helmet>
<div style="width: ${w}px; height: ${h}px; box-sizing: border-box; padding: 48px; background: #fbf3e4; font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif; color: #3b2a1c; display: flex; flex-direction: column; gap: 28px">
${body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":${w},"height":${h}}}'>
class Component extends DCLogic {
renderVals() {
return {};
}
}
</script>
</body>
</html>
`;
const head = (t, sub) => `<header style="display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap"><h1 style="margin: 0; font-size: 34px; font-weight: 900">${t}</h1><p style="margin: 0; font-size: 16px; color: #7a6650">${sub}</p></header>`;
const grid = (cols, gap, items) => `<div style="display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); gap: ${gap}px; justify-items: center">${items.join('')}</div>`;

const boards = {};
const write = (file, title, w, h, body) => {
  writeFileSync(new URL(`project/${file}`, ROOT), page(title, w, h, body));
  boards[file] = { w, h, title };
};

// 표지
writeFileSync(new URL('project/Main.dc.html', ROOT), page('표지', 1600, 1000, inline('cover', 1504)).replace('padding: 48px', 'padding: 48px').replace('gap: 28px', 'gap: 0; align-items: center; justify-content: center'));
boards['Main.dc.html'] = { w: 1600, h: 1000, title: '표지 (art/cover.svg)' };

write('Logo.dc.html', '로고', 1000, 400, `<div style="flex: 1; display: flex; align-items: center; justify-content: center">${inline('logo', 860)}</div><p style="margin: 0; text-align: center; font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 12px; color: #7a6650">art/logo.svg</p>`);
boards['Logo.dc.html'].title = '로고';

const TW = 236; // 34mm(변–변) × 6px/mm
const spotItems = SPOT_IDS.map((id) => cell(`spot-${id}`, SPOTS[id].mark ? `${SPOTS[id].name} · ${SPOTS[id].mark}` : SPOTS[id].name, TW));
spotItems.push(cell('spot-back', '뒷면 (모두 같음)', TW));
write('Spots.dc.html', '명당 타일', 1492, 820, head('명당 타일 9종 + 뒷면', '실물 지름 34mm(변–변) · 1mm = 6px · 숫자 배지는 회전 0 기준') + grid(5, 24, spotItems));
boards['Spots.dc.html'].title = '명당 타일';

const board = [
  ...['empty', 'fertile', 'pond', 'rock'].map((k) => cell(`terrain-${k}`, TERRAIN[k].name, TW)),
  ...[0, 1, 2].map((s) => cell(`hideout-${s}`, `${SEAT_NAME[s]} 아지트`, TW)),
];
const tokens = [0, 1, 2].map((s) => cell(`cat-${s}`, `${SEAT_NAME[s]} 토큰`, 96));
write('Board.dc.html', '골목 칸과 고양이 토큰', 1560, 900, head('골목 칸 · 아지트 · 고양이 토큰', '칸 34mm · 토큰 지름 16mm · 1mm = 6px') + grid(4, 24, board.slice(0, 4)) + `<div style="display: flex; gap: 24px; align-items: flex-end; flex-wrap: wrap">${board.slice(4).join('')}<div style="display: flex; gap: 32px; align-items: flex-end; padding-left: 40px">${tokens.join('')}</div></div>`);
boards['Board.dc.html'].title = '골목 칸 · 토큰';

const CW = 252; // 63 × 88mm, 1mm = 4px
const goalItems = GOALS.map((g) => cell(`goal-${g.id}`, `${g.name}${g.reserve ? ' (단골)' : ''}`, CW));
goalItems.push(cell('goal-back', '뒷면', CW));
write('Goals.dc.html', '소문 카드', 1728, 1420, head('소문 카드 16장 + 뒷면', '63 × 88mm · 1mm = 4px · 초록 띠 = 단골 6장, 주황 띠 = 일반 10장') + grid(6, 24, goalItems));
boards['Goals.dc.html'].title = '소문 카드';

const layout = {
  'Main.dc.html': [0, 0],
  'Logo.dc.html': [1680, 0],
  'Spots.dc.html': [0, 1120],
  'Board.dc.html': [1572, 1120],
  'Goals.dc.html': [0, 2140],
};
const canvas = {
  v: 3,
  createdOnFiles: { v: 1, at: new Date().toISOString().replace(/\.\d+Z$/, 'Z') },
  title: '냥냥 골목 — 카드·타일 디자인',
  launch: { view: 'canvas' },
  pages: [],
  boards: Object.fromEntries(Object.entries(layout).map(([k, [x, y]]) => [k, { x, y, w: boards[k].w, h: boards[k].h, title: boards[k].title }])),
  order: Object.keys(layout),
  notes: {},
  designSystems: [],
};
writeFileSync(new URL('project/canvas.json', ROOT), JSON.stringify(canvas, null, 1));
for (const k of Object.keys(layout)) console.log(k, readFileSync(new URL(`project/${k}`, ROOT)).length);
