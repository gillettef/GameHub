/**
 * 골목 일과 밸런스: 일과마다 선택률(펼쳐져 고를 수 있었을 때 고른 비율), 첫 번째로 고를 때 선택률,
 * 고른 사람의 승률(공정값 대비), 판당 고른 횟수.
 *   npx tsx tools/lab/chorebal.ts <변형> [인원=2] [판수=80] [봇=human|arch]
 */
import { Game, mulberry32, shuffle } from './engine.js';
import { ARCHETYPES, makeBot } from './bots.js';
import { VARIANTS } from './registry.js';

const name = process.argv[2] ?? 'c1';
const P = Number(process.argv[3] ?? 2);
const N = Number(process.argv[4] ?? 80);
const mode = process.argv[5] ?? 'human';
const rules = VARIANTS[name];
if (!rules?.chores) throw new Error(`일과 변형이 아님: ${name}`);
type Row = { offered: number; chosen: number; firstOffered: number; firstChosen: number; picks: number; winPicks: number };
const rows = new Map<string, Row>();
const row = (k: string) => rows.get(k) ?? (rows.set(k, { offered: 0, chosen: 0, firstOffered: 0, firstChosen: 0, picks: 0, winPicks: 0 }), rows.get(k)!);
const rand = mulberry32(777);
const seatWins = new Array(P).fill(0);
for (let i = 0; i < N; i++) {
  const g = new Game(rules, P, 5000 + i);
  const names = mode === 'arch' ? shuffle(ARCHETYPES, rand).slice(0, P) : new Array(P).fill('human');
  const bots = names.map(makeBot);
  const r2 = mulberry32(9000 + i);
  let guard = 0;
  while (!g.over && guard++ < 3000) {
    const s = g.current;
    const b = bots[s]!;
    if (g.needs() === 'draft') g.doDraft(b.draft!(g, s, r2));
    else if (g.needs() === 'take') {
      const look3 = rules.chores.peekMode === 'look3' && g.choreOf[s] === 'peek';
      if (look3) g.peekOpen();
      const act = b.action!(g, s, r2);
      if (act.kind === 'place') {
        g.doTake(act.take);
        if (look3) g.peekClose();
        else if (g.choreOf[s] === 'peek') g.takeExtra();
      } else {
        if (look3) g.peekClose();
        g.doAction(act);
      }
    } else g.doPlant(b.plant(g, s, r2));
  }
  const w = g.winner();
  seatWins[w]++;
  for (const d of g.draftLog) {
    for (const o of new Set(d.offered)) {
      row(o).offered++;
      if (d.pickNo === 0) row(o).firstOffered++;
    }
    row(d.chose).chosen++;
    if (d.pickNo === 0) row(d.chose).firstChosen++;
    row(d.chose).picks++;
    if (d.seat === w) row(d.chose).winPicks++;
  }
}
const fair = 1 / P;
console.log(`${name} ${P}인 ${N}판 (${mode}) — 자리 승률 ${seatWins.map((x) => ((x / N) * 100).toFixed(0)).join('/')}%`);
console.log('일과      선택률(있을 때)  첫 선택률  판당 고름  고른 사람 승률(공정 ' + (fair * 100).toFixed(0) + '%)');
for (const [k, r] of [...rows].sort((a, b) => b[1].chosen / b[1].offered - a[1].chosen / a[1].offered)) {
  const pr = ((r.chosen / Math.max(1, r.offered)) * 100).toFixed(0);
  const fp = ((r.firstChosen / Math.max(1, r.firstOffered)) * 100).toFixed(0);
  const wr = ((r.winPicks / Math.max(1, r.picks)) * 100).toFixed(0);
  console.log(`${k.padEnd(8)}  ${pr.padStart(6)}%        ${fp.padStart(4)}%     ${(r.picks / N).toFixed(1).padStart(5)}      ${wr}%`);
}
