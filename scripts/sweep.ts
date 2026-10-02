/**
 * 좌석 공정성 파라미터 스윕: 조합별로 2·3·4인 거울 대전의 좌석 승률 편차(RMS)를 비교한다.
 *   npx tsx scripts/sweep.ts [--n 2000]
 */
import { CFG, newGame, rankings } from '../src/game/engine';

const i = process.argv.indexOf('--n');
const N = i >= 0 ? Number(process.argv[i + 1]) : 2000;

function seatWins(pl: number, seed0: number) {
  const wins = Array(pl).fill(0);
  for (let g = 0; g < N; g++) {
    const s = newGame({ humans: 0, aiCount: pl, seed: g * 7919 + seed0, profiles: Array(pl).fill('balanced') });
    wins[(rankings(s)[0].id - s.startFirst + pl) % pl]++; // 1라운드 순서 기준
  }
  return wins.map((w) => w / N);
}

const rms = (w: number[]) => Math.sqrt(w.reduce((a, x) => a + (x - 1 / w.length) ** 2, 0) / w.length) * 100;
const fmt = (w: number[]) => w.map((x) => (x * 100).toFixed(0).padStart(2)).join('/');

const grid: { seatBonus: number; marketExtra: number }[] = [];
for (const seatBonus of [1, 1.5, 2, 3]) for (const marketExtra of [2, 3]) grid.push({ seatBonus, marketExtra });

console.log(`n=${N}/설정  | 2인 | 3인 | 4인 | RMS편차(2/3/4인, %p)`);
for (const g of grid) {
  CFG.marketExtra = g.marketExtra;
  CFG.seatBonus = g.seatBonus;
  const w2 = seatWins(2, 1);
  const w3 = seatWins(3, 1);
  const w4 = seatWins(4, 1);
  const score = (rms(w2) + rms(w3) + rms(w4)) / 3;
  console.log(
    `mkt+${g.marketExtra} bonus=${g.seatBonus} | ${fmt(w2)} | ${fmt(w3)} | ${fmt(w4)} | ${rms(w2).toFixed(1)}/${rms(w3).toFixed(1)}/${rms(w4).toFixed(1)}  평균 ${score.toFixed(2)}`,
  );
}
