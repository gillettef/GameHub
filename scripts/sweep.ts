/**
 * 좌석 공정성 스윕 (거울 대전, 1라운드 순서별 승률. 공동 1위는 나눠 센다)
 *   npx tsx scripts/sweep.ts [--n 2000] [--players 2,3,4,5] [--set pickOrder=1]
 *     인원별로 선형 seatBonus 후보(--bonus 0,1,2)를 비교한다.
 *   npx tsx scripts/sweep.ts --fit [--n 2000] [--iter 10]
 *     인원별 좌석 추가 자금 표를 탐욕적으로 맞춘다 (가장 많이 이기는 좌석 -$1 / 가장 적게 이기는 좌석 +$1).
 *     결과를 CFG.seatMoneyByPlayers 에 넣는다.
 */
import { CFG, newGame, seatMoney, winners } from '../src/game/engine';

const arg = (k: string, d: string) => (process.argv.indexOf('--' + k) >= 0 ? process.argv[process.argv.indexOf('--' + k) + 1] : d);
const N = Number(arg('n', '2000'));
const BONUS = arg('bonus', '0,0.5,1,1.5,2,2.5,3').split(',').map(Number);
const PLAYERS = arg('players', '2,3,4,5').split(',').map(Number);
const ITER = Number(arg('iter', '10'));
for (const kv of arg('set', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  (CFG as unknown as Record<string, number>)[k] = Number(v);
}

function seatWins(pl: number) {
  const wins = Array(pl).fill(0);
  for (let g = 0; g < N; g++) {
    const s = newGame({ humans: 0, aiCount: pl, seed: g * 7919 + 1, profiles: Array(pl).fill('balanced') });
    const w = winners(s);
    for (const p of w) wins[(p.id - s.startFirst + pl) % pl] += 1 / w.length;
  }
  return wins.map((w) => w / N);
}

const rms = (w: number[]) => Math.sqrt(w.reduce((a, x) => a + (x - 1 / w.length) ** 2, 0) / w.length) * 100;
const fmt = (w: number[]) => w.map((x) => (x * 100).toFixed(0).padStart(2)).join('/');
const saved = structuredClone(CFG.seatMoneyByPlayers);

if (process.argv.includes('--fit')) {
  const result: Record<number, number[]> = {};
  for (const pl of PLAYERS) {
    let table = Array.from({ length: pl }, (_, i) => seatMoney(pl, i));
    let best = { table, r: Infinity, w: [] as number[] };
    for (let it = 0; it < ITER; it++) {
      CFG.seatMoneyByPlayers = { ...saved, [pl]: table };
      const w = seatWins(pl);
      const r = rms(w);
      console.log(`${pl}인 [${table.join(',')}] | ${fmt(w)} | RMS ${r.toFixed(1)}%p`);
      if (r < best.r) best = { table, r, w };
      const hi = w.indexOf(Math.max(...w));
      const lo = w.indexOf(Math.min(...w));
      table = [...table];
      if (table[hi] > 0) table[hi]--;
      else table[lo]++;
      const min = Math.min(...table);
      table = table.map((x) => x - min); // 1번째 좌석 기준으로 정규화
    }
    result[pl] = best.table;
    console.log(`→ ${pl}인 [${best.table.join(',')}] ${fmt(best.w)} RMS ${best.r.toFixed(1)}%p\n`);
  }
  console.log('seatMoneyByPlayers:', JSON.stringify(result));
} else {
  for (const pl of PLAYERS) {
    for (const b of BONUS) {
      CFG.seatBonus = b;
      CFG.seatMoneyByPlayers = { ...saved };
      delete CFG.seatMoneyByPlayers[pl];
      const w = seatWins(pl);
      console.log(`${pl}인 bonus=${b} | ${fmt(w)} | RMS ${rms(w).toFixed(1)}%p`);
    }
    console.log();
  }
}
CFG.seatMoneyByPlayers = saved;
