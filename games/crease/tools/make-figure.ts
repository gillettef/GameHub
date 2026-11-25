// 기획안·룰북용 설명 그림 생성: 펼침 / 왼쪽 3선 접기 / 양쪽 2선 접기를 엔진 좌표로 그린다.
// 사용: npm run figure  → docs/submission/fold-diagram.svg
import { mkdirSync, writeFileSync } from 'node:fs'
import { COLS, ROWS, cellName, isCoveredCol, isFlippedCol, physPos, type Cell, type Fold } from '../src/engine/engine.ts'

const CS = 34; const GAP = 70; const PADX = 20;
const panels: { fold: Fold; title: string; path: Cell[] }[] = [
  { fold: { L: 0, R: 0 }, title: '① 펼친 보드: A1에서 G3까지 8걸음', path: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2]] },
  { fold: { L: 3, R: 0 }, title: '② 왼쪽 3선으로 접기: A열이 G열 옆으로 → 3걸음', path: [[0, 0], [0, 1], [0, 2], [6, 2]] },
  { fold: { L: 2, R: 2 }, title: '③ 양쪽 2선 접기: A1에서 I5까지 12걸음 → 6걸음', path: [[0, 0], [4, 0], [8, 0], [8, 1], [8, 2], [8, 3], [8, 4]] },
];
const W = PADX * 2 + COLS * CS + 260;
const H = panels.length * (ROWS * CS + GAP) + 10;
const out: string[] = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Pretendard, 'Noto Sans KR', sans-serif">`);
out.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
panels.forEach((pn, i) => {
  const oy = i * (ROWS * CS + GAP) + 38;
  out.push(`<text x="${PADX}" y="${oy - 12}" font-size="15" font-weight="700" fill="#2b2a28">${pn.title}</text>`);
  // 빈 자리
  for (let p = 0; p < COLS; p++) {
    let used = false;
    for (let c = 0; c < COLS; c++) if (physPos(pn.fold, c) === p || (isCoveredCol(pn.fold, c) && c === p)) used = true;
    if (!used) out.push(`<rect x="${PADX + p * CS + 2}" y="${oy + 2}" width="${CS - 4}" height="${ROWS * CS - 4}" rx="4" fill="none" stroke="#b5b5b5" stroke-dasharray="3 3"/>`);
  }
  for (let c = 0; c < COLS; c++) {
    if (isCoveredCol(pn.fold, c)) continue;
    const x = PADX + physPos(pn.fold, c) * CS;
    const back = isFlippedCol(pn.fold, c);
    for (let r = 0; r < ROWS; r++) {
      out.push(`<rect x="${x}" y="${oy + r * CS}" width="${CS}" height="${CS}" fill="${back ? '#d8e3ea' : '#f4ecd8'}" stroke="#a89c80"/>`);
      out.push(`<text x="${x + 3}" y="${oy + r * CS + 11}" font-size="9" fill="#6f6a60">${cellName(c, r)}</text>`);
    }
  }
  const seam = (p: number) => out.push(`<line x1="${PADX + p * CS}" y1="${oy}" x2="${PADX + p * CS}" y2="${oy + ROWS * CS}" stroke="#d9a521" stroke-width="4"/>`);
  if (pn.fold.L) seam(2 * pn.fold.L);
  if (pn.fold.R) seam(COLS - 2 * pn.fold.R);
  // 경로
  const pts = pn.path.map(([c, r]) => [PADX + physPos(pn.fold, c) * CS + CS / 2, oy + r * CS + CS / 2]);
  out.push(`<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#d1495b" stroke-width="3" stroke-linejoin="round" marker-end="url(#arr)"/>`);
  out.push(`<circle cx="${pts[0]![0]}" cy="${pts[0]![1]}" r="7" fill="#d1495b"/>`);
  // 설명
  const lx = PADX + COLS * CS + 20;
  const notes = i === 0
    ? ['보드는 9열 × 5행.', '양 끝 6열은 한 열씩 접히는', '날개 패널, 가운데 D~F는', '중앙 패널이다.']
    : i === 1
      ? ['푸른 칸 = 넘어간 날개의 뒷면', '(앞면과 같은 좌표가 인쇄됨).', 'D~F열은 날개 아래에 가려져', '그 위의 말·조각은 부재.', '금색 선 = 이음(새 이웃).']
      : ['양쪽 날개 폭의 합은 4까지.', '지도가 짧아질수록 길은', '빨라지지만, 가려지는', '칸도 늘어난다.'];
  notes.forEach((t, k) => out.push(`<text x="${lx}" y="${oy + 16 + k * 19}" font-size="13" fill="#3d3a35">${t}</text>`));
});
out.push('<defs><marker id="arr" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto"><path d="M0,0 L12,6 L0,12 z" fill="#d1495b"/></marker></defs>');
out.push('</svg>');
mkdirSync('docs/submission', { recursive: true });
writeFileSync('docs/submission/fold-diagram.svg', out.join('\n'));
console.log('docs/submission/fold-diagram.svg');
