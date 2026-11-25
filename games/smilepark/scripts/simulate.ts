/**
 * AI 대전 요약.  npm run sim -- [판 수=500] [인원=3]
 * 좌석 승률은 1라운드 순서(startFirst 기준) 기준이며, 공동 1위는 승리를 나눠 센다.
 */
import { newGame, probe, winners } from '../src/engine/engine';
import { CARD_BY_ID } from '../src/engine/data/cards';

const N = Number(process.argv[2] ?? 500);
const players = Number(process.argv[3] ?? 3);
const wins = Array(players).fill(0);
let vp = 0, money = 0, fac = 0, minVp = 999, maxVp = -999;
let groups = 0, unplaced = 0, sat = 0, fee = 0, wear = 0, trash = 0, rep = 0, bids = 0;
const staff = { engineer: 0, marketer: 0, cleaner: 0, guide: 0, researcher: 0 };
const buysByKind: Record<string, number> = {};
const buysByRound = Array(9).fill(0);
probe.buy = (_p, id, _price, round) => {
  const k = CARD_BY_ID[id].kind;
  buysByKind[k] = (buysByKind[k] ?? 0) + 1;
  buysByRound[round]++;
};
probe.report = (p, r) => {
  rep++;
  groups += r.groups; unplaced += r.unplaced.length; sat += r.sat; fee += r.fee;
  wear += r.places.filter((l) => l.wear).length; trash += r.trashAdded; bids += p.bid ?? 0;
};
for (let i = 0; i < N; i++) {
  const s = newGame({ humans: 0, aiCount: players, seed: i + 1 });
  if (s.phase !== 'gameOver') throw new Error('게임이 끝나지 않음 ' + s.phase);
  const w = winners(s);
  for (const p of w) wins[(p.id - s.startFirst + players) % players] += 1 / w.length;
  s.players.forEach((p) => {
    vp += p.vp; money += p.money; fac += p.facilities.filter(Boolean).length;
    minVp = Math.min(minVp, p.vp); maxVp = Math.max(maxVp, p.vp);
    for (const k of Object.keys(staff) as (keyof typeof staff)[]) staff[k] += p.staff[k];
  });
}
const T = N * players;
const f = (x: number) => x.toFixed(2);
console.log(`게임 ${N}판 / ${players}인`);
console.log(`평균 만족도 ${(vp / T).toFixed(1)} (min ${minVp}, max ${maxVp}) · 평균 잔액 $${(money / T).toFixed(1)} · 평균 시설 ${(fac / T).toFixed(1)}`);
console.log('1라운드 순서별 승률', wins.map((w) => ((w / N) * 100).toFixed(0) + '%').join(' '));
console.log('평균 인력 Lv', Object.entries(staff).map(([k, v]) => `${k} ${f(v / T)}`).join(' · '));
console.log(`라운드당(인당): 입장 그룹 ${f(groups / rep)} · 미배치 ${f(unplaced / rep)} · 만족도 ${f(sat / rep)} · 입장료 $${f(fee / rep)} · 입찰 $${f(bids / rep)} · 수리 토큰 ${f(wear / rep)} · 쓰레기 ${f(trash / rep)}`);
console.log(`라운드별 건설(인당) ${buysByRound.slice(1).map((b) => f(b / T)).join(' ')}`);
console.log('종류별 건설(인당)', Object.entries(buysByKind).map(([k, v]) => `${k} ${f(v / T)}`).join(' · '));
