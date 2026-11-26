/** 자리 쏠림 진단: 자리별 승률, 라운드 선 횟수, 대장 방울로 선이 된 횟수. npx tsx tools/lab/seatdiag.ts <변형> [인원] [판수] */
import { playGame } from './play.js';
import { Game } from './engine.js';
import { VARIANTS } from './registry.js';
const name = process.argv[2] ?? 'c2';
const P = Number(process.argv[3] ?? 3);
const N = Number(process.argv[4] ?? 120);
const rules = VARIANTS[name]!;
const wins = new Array(P).fill(0);
const scoreSum = new Array(P).fill(0);
for (let i = 0; i < N; i++) {
  const r = playGame(rules, P, 7000 + i, new Array(P).fill('human'));
  wins[r.winner]++;
  r.scores.forEach((v, s) => (scoreSum[s] += v));
}
console.log(`${name} ${P}인 ${N}판 자리 승률 ${wins.map((w) => ((w / N) * 100).toFixed(0)).join('/')}% · 평균 점수 ${scoreSum.map((v) => (v / N).toFixed(1)).join('/')}`);
void Game;
