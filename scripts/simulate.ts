/**
 * AI 대전 요약.  npm run sim -- [판 수=500] [인원=3]
 * 좌석 승률은 1라운드 순서(startFirst 기준) 기준이며, 공동 1위는 승리를 나눠 센다.
 */
import { newGame, probe, winners } from '../src/game/engine';
import { FACILITY_BY_ID } from '../src/game/data/facilities';

const N = Number(process.argv[2] ?? 500);
const players = Number(process.argv[3] ?? 3);
const wins = Array(players).fill(0);
let vp = 0, money = 0, fac = 0, minVp = 99, maxVp = -99, festivals = 0, unserved = 0;
const staff = { engineer: 0, marketer: 0, cleaner: 0, guide: 0, researcher: 0 };
const buysByType: Record<string, number> = {};
const lateBuys = Array(9).fill(0);
probe.buy = (_p, id, _price, round) => {
  const t = FACILITY_BY_ID[id].type;
  buysByType[t] = (buysByType[t] ?? 0) + 1;
  lateBuys[round]++;
};
probe.roundEnd = (s) => {
  for (const p of s.players) unserved += p.report?.unserved ?? 0;
};
for (let i = 0; i < N; i++) {
  const s = newGame({ humans: 0, aiCount: players, seed: i + 1 });
  if (s.phase !== 'gameOver') throw new Error('게임이 끝나지 않음 ' + s.phase);
  const w = winners(s);
  for (const p of w) wins[(p.id - s.startFirst + players) % players] += 1 / w.length;
  festivals += s.log.filter((l) => l.includes('축제 개최')).length;
  s.players.forEach((p) => {
    vp += p.vp; money += p.money; fac += p.facilities.filter(Boolean).length;
    minVp = Math.min(minVp, p.vp); maxVp = Math.max(maxVp, p.vp);
    for (const k of Object.keys(staff) as (keyof typeof staff)[]) staff[k] += p.staff[k];
  });
}
const T = N * players;
console.log(`게임 ${N}판 / ${players}인`);
console.log(`평균 VP ${(vp / T).toFixed(1)} (min ${minVp}, max ${maxVp}) · 평균 잔액 $${(money / T).toFixed(1)} · 평균 시설 ${(fac / T).toFixed(1)}`);
console.log('1라운드 순서별 승률', wins.map((w) => ((w / N) * 100).toFixed(0) + '%').join(' '));
console.log('평균 인력 Lv', Object.entries(staff).map(([k, v]) => `${k} ${(v / T).toFixed(2)}`).join(' · '));
console.log(`라운드별 건설(인당) ${lateBuys.slice(1).map((b) => (b / T).toFixed(2)).join(' ')} · 축제(인당) ${(festivals / T).toFixed(2)} · 못 쓴 관객(인당·판) ${(unserved / T).toFixed(2)}`);
console.log('유형별 건설(인당)', Object.entries(buysByType).map(([k, v]) => `${k} ${(v / T).toFixed(2)}`).join(' · '));
