import { newGame } from '../src/game/engine';

const N = Number(process.argv[2] ?? 500);
const players = Number(process.argv[3] ?? 3);
const wins = Array(players).fill(0);
let vp = 0, money = 0, fac = 0, rounds = 0, minVp = 99, maxVp = 0;
const staff = { engineer: 0, marketer: 0, cleaner: 0, guide: 0, researcher: 0 };
for (let i = 0; i < N; i++) {
  const s = newGame({ humans: 0, aiCount: players, seed: i + 1 });
  if (s.phase !== 'gameOver') throw new Error('게임이 끝나지 않음 ' + s.phase);
  rounds += s.round;
  const top = Math.max(...s.players.map((p) => p.vp));
  s.players.forEach((p, idx) => {
    if (p.vp === top) wins[idx]++;
    vp += p.vp; money += p.money; fac += p.facilities.filter(Boolean).length;
    minVp = Math.min(minVp, p.vp); maxVp = Math.max(maxVp, p.vp);
    for (const k of Object.keys(staff) as (keyof typeof staff)[]) staff[k] += p.staff[k];
  });
}
const T = N * players;
console.log(`게임 ${N}판 / ${players}인`);
console.log(`평균 VP ${(vp / T).toFixed(1)} (min ${minVp}, max ${maxVp}) · 평균 잔액 $${(money / T).toFixed(1)} · 평균 시설 ${(fac / T).toFixed(1)}`);
console.log('좌석별 승률', wins.map((w) => ((w / N) * 100).toFixed(0) + '%').join(' '));
console.log('평균 인력 Lv', Object.entries(staff).map(([k, v]) => `${k} ${(v / T).toFixed(2)}`).join(' · '));
