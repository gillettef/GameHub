/**
 * 가져오기 종류(펼친 타일 vs 주머니)의 균형을 잰다 (2026-11-27).
 *   npx tsx tools/lab/takebal.ts <변형,...> [인원=2,3] [판수=150]
 *  - 사람 흉내 봇끼리: 가져오기 중 펼친 타일·주머니 비율, 주머니를 더 많이 쓴 사람의 승률
 *  - 고집 봇: 한 자리만 펼친 타일만(greedy-market) / 주머니만(greedy-pile) 쓰고 나머지는 탐욕 봇일 때 그 자리의 승률(공정값 1/인원)
 */
import { playGame } from './play.js';
import { VARIANTS } from './registry.js';

const names = (process.argv[2] ?? 'o2r18').split(',');
const Ps = (process.argv[3] ?? '2,3').split(',').map(Number);
const N = Number(process.argv[4] ?? 150);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

for (const nm of names) {
  const rules = VARIANTS[nm];
  if (!rules) throw new Error(`변형 없음: ${nm}`);
  for (const P of Ps) {
    let market = 0;
    let pile = 0;
    let pileHeavyWins = 0;
    let pileHeavyGames = 0;
    for (let i = 0; i < N; i++) {
      const r = playGame(rules, P, 7000 + i, new Array(P).fill('human'));
      market += r.takeMarket.reduce((a, b) => a + b, 0);
      pile += r.takePile.reduce((a, b) => a + b, 0);
      // 주머니 비율이 가장 높은 자리(동점이면 건너뜀)가 이겼나
      const share = r.takePile.map((p, s) => p / Math.max(1, p + (r.takeMarket[s] ?? 0)));
      const top = Math.max(...share);
      const who = share.filter((x) => x === top).length === 1 ? share.indexOf(top) : -1;
      if (who >= 0) {
        pileHeavyGames++;
        if (r.winner === who) pileHeavyWins++;
      }
    }
    const duel = (bot: string) => {
      let wins = 0;
      for (let i = 0; i < N; i++) {
        const seat = i % P;
        const bots = new Array(P).fill('greedy');
        bots[seat] = bot;
        if (playGame(rules, P, 9000 + i, bots).winner === seat) wins++;
      }
      return wins / N;
    };
    const base = duel('greedy');
    console.log(
      `${nm} ${P}인 | 가져오기: 펼친 ${pct(market / Math.max(1, market + pile))} · 주머니 ${pct(pile / Math.max(1, market + pile))} | 주머니를 가장 많이 쓴 사람 승률 ${pct(pileHeavyWins / Math.max(1, pileHeavyGames))} (공정 ${pct(1 / P)}) | 고집 봇 승률: 탐욕 ${pct(base)} · 펼친 것만 ${pct(duel('greedy-market'))} · 주머니만 ${pct(duel('greedy-pile'))}`,
    );
  }
}
