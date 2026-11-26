/**
 * 공모전 그림용: 실험실 엔진으로 봇끼리 몇 차례 둔 판 상태를 JSON 으로 뽑는다.
 *   npx tsx submission/tools/dump-state.ts <인원> <시드> <심은 횟수> > out.json
 * 규칙은 지금 규칙(v6). 그림(진행 모습·규칙서 예시)의 판이 실제 규칙으로 나올 수 있는 판이 되도록 엔진을 그대로 쓴다.
 */
import { makeBot } from '../../tools/lab/bots.js';
import { Game, mulberry32 } from '../../tools/lab/engine.js';
import { VARIANTS } from '../../tools/lab/registry.js';

const P = Number(process.argv[2] ?? 2);
const seed = Number(process.argv[3] ?? 7);
const plays = Number(process.argv[4] ?? 10);
const rules = VARIANTS[process.env.VARIANT ?? 'v6']!;
const g = new Game(rules, P, seed);
const bots = Array.from({ length: P }, () => makeBot('human'));
const rand = mulberry32(seed ^ 0x5bd1e995);
// 실험실 엔진은 회전을 "서로 다른 회전 목록의 번호"로 다룬다. 그림에는 실제 회전 수(0~5)가 필요해 심을 때 기록한다
const rotK = new Map<number, number>();
const origPlant = g.doPlant.bind(g);
g.doPlant = (m) => {
  if (m.cell >= 0 && m.hand >= 0) {
    const spi = g.hands[g.current]![m.hand]!;
    const want = JSON.stringify(g.rotCache[spi]![m.rot]);
    let pat = rules.species[spi]!.pattern.map((x) => [...x]);
    for (let k = 0; k < 6; k++) {
      if (JSON.stringify(pat) === want) {
        rotK.set(m.cell, k);
        break;
      }
      pat = pat.map(([q, r, v]) => [-r!, q! + r!, v!]);
    }
  }
  origPlant(m);
};
while (!g.over && g.turns < plays) {
  const s = g.current;
  if (g.needs() === 'take') g.doTake(bots[s]!.take(g, s, rand));
  else g.doPlant(bots[s]!.plant(g, s, rand));
}
const geo = g.geo;
const sp = (i: number) => (i >= 0 ? rules.species[i]!.id : null);
const cells = Array.from({ length: geo.n }, (_, c) => ({
  q: geo.q[c],
  r: geo.r[c],
  terrain: ['empty', 'pond', 'rock', 'fertile'][geo.terrain[c]!],
  tile: geo.tile[c],
  entrance: g.entranceSeat[c],
  seat: g.color[c],
  count: g.color[c]! >= 0 ? g.inf[g.color[c]!]![c] : 0,
  plant: sp(g.plant[c]!),
  rotation: rotK.get(c) ?? 0,
}));
console.log(
  JSON.stringify({
    players: P,
    turns: g.turns,
    round: g.round,
    current: g.current,
    cells,
    hands: g.hands.map((h) => h.map(sp)),
    market: g.market.map(sp),
    bag: g.bag.length,
    goals: g.goals.map((x) => x.id),
    species: g.speciesIds.map(sp),
    scores: g.scores(),
    speciesDefs: rules.species.map((x) => ({ id: x.id, name: x.name, pattern: x.pattern, ability: x.ability?.kind ?? null, tags: x.tags ?? [] })),
    supply: g.onBoard.map((v) => (rules.supply?.[P] ?? 0) - v),
  }),
);
