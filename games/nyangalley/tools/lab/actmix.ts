/**
 * 행동 고르기 변형의 행동 비율·판 길이를 빨리 본다(사람 흉내 봇끼리).
 *   npx tsx tools/lab/actmix.ts <변형,...> [인원=2] [판수=60]
 */
import { playGame } from './play.js';
import { VARIANTS } from './registry.js';

const names = (process.argv[2] ?? 'a1').split(',');
const P = Number(process.argv[3] ?? 2);
const N = Number(process.argv[4] ?? 60);
for (const nm of names) {
  const rules = VARIANTS[nm];
  if (!rules) throw new Error(`변형 없음: ${nm}`);
  const tot = { place: 0, move: 0, gather: 0, call: 0 };
  const ch: Record<string, number> = {};
  let flips = 0;
  let turns = 0;
  let maxStack = 0;
  let sameAsLast = 0;
  for (let i = 0; i < N; i++) {
    const r = playGame(rules, P, 3000 + i, new Array(P).fill('human'));
    for (const k of Object.keys(tot) as (keyof typeof tot)[]) tot[k] += r.actionCount[k] ?? 0;
    for (const [k, v] of Object.entries(r.choreCount ?? {})) ch[k] = (ch[k] ?? 0) + v;
    flips += r.flips;
    turns += r.turns;
    maxStack = Math.max(maxStack, r.maxStack);
    sameAsLast += r.sameAsLast ?? 0;
  }
  const sum = tot.place + tot.move + tot.gather + tot.call || 1;
  const chSum = Object.values(ch).reduce((a, b) => a + b, 0) || 1;
  const chLine = Object.keys(ch).length ? ' | 일과 ' + Object.entries(ch).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${((v / chSum) * 100).toFixed(0)}%`).join(' ') : '';
  const pct = (x: number) => `${((x / sum) * 100).toFixed(0)}%`;
  console.log(
    `${nm.padEnd(8)} 놓기 ${pct(tot.place)} · 담 넘기 ${pct(tot.move)} · 모여라 ${pct(tot.gather)} · 부르기 ${pct(tot.call)} | 직전과 같은 행동 ${pct(sameAsLast)} | 판당 차례 ${(turns / N).toFixed(1)} · 차례당 뺏은 칸 ${(flips / Math.max(1, turns)).toFixed(2)} · 한 칸 최대 ${maxStack}${chLine}`,
  );
}
