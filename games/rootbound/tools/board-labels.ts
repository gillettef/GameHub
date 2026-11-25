/**
 * 인원별 칸 이름 지도 (Rules.md 2절 "칸 이름", notes/Board.md 1절).
 *   npx tsx tools/board-labels.ts
 * 한 칸 = 4글자 폭, 줄마다 반 칸(2글자) 엇갈림. [n] = n번 자리 입구. 윤곽이 인원마다 고정이라 시드와 무관하다.
 */
import { buildBoard, cellLabels } from '../src/engine/board.js';
for (const P of [2, 3, 4]) {
  const { board } = buildBoard(P, 12345);
  const L = cellLabels(board);
  console.log(P, 'unique', new Set(L).size === L.length, board.cells.length);
  const minX = Math.min(...board.cells.map((c) => 2 * c.q + c.r));
  const rows = new Map<number, string[]>();
  board.cells.forEach((c, i) => {
    const row = rows.get(c.r) ?? [];
    const x = 2 * c.q + c.r - minX;
    while (row.length < x * 2) row.push(' ');
    const ent = board.entrances.findIndex((e) => e.q === c.q && e.r === c.r);
    row.splice(x * 2, 3, ...(ent >= 0 ? `[${ent + 1}]` : L[i]!.padEnd(3)).split(''));
    rows.set(c.r, row);
  });
  for (const r of [...rows.keys()].sort((a, b) => a - b)) console.log(rows.get(r)!.join(''));
  console.log('entrances', board.entrances.map((e) => L[board.cells.findIndex((c) => c.q === e.q && c.r === e.r)]).join(' '));
}
