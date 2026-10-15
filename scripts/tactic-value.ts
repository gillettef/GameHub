/**
 * 전략 카드 가치 측정 (자연 실험).
 *   npx tsx scripts/tactic-value.ts --games 3000 --players 3 --ai normal --seed 42
 * 각 에이전트는 4종 중 무작위 3장을 받으므로 "빠진 카드"가 무작위다.
 * 빠진 카드별 평균 점수·승률을 비교하면, 그 카드를 가진 것의 가치(나머지 3종 대비)를 편향 없이 추정할 수 있다.
 *   카드 X의 가치 ≈ (X가 아닌 카드가 빠진 에이전트 평균) − (X가 빠진 에이전트 평균)
 */
import { TACTICS, TACTIC_KEYS, createGame, createRng, nextRound, resolveRound, winners } from '../src/core';
import type { AiLevel, GameState, TacticKey } from '../src/core';

declare const process: { argv: string[] };
const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : d;
};
const GAMES = Number(arg('games', '3000'));
const N = Number(arg('players', '3'));
const SEED = Number(arg('seed', '42'));
const AI = arg('ai', 'normal') as AiLevel | 'mixed';
const JSON_OUT = args.includes('--json');

const r2 = (x: number) => Math.round(x * 100) / 100;
const stat = Object.fromEntries(TACTIC_KEYS.map((k) => [k, { n: 0, score: 0, sq: 0, wins: 0 }]));
const use = Object.fromEntries([...TACTIC_KEYS, 'hijack'].map((k) => [k, { n: 0, won: 0, fee: 0 }]));

const master = createRng(SEED);
for (let gi = 0; gi < GAMES; gi++) {
  const levels: AiLevel[] = Array.from({ length: N }, (_, i) => (AI === 'mixed' ? ((i + gi) % N < Math.floor(N / 2) ? 'normal' : 'easy') : AI));
  let g: GameState = createGame(levels.map((level, i) => ({ name: `AI${i}`, kind: 'ai' as const, level })), master.int(0x7fffffff));
  const missing = g.agents.map((a) => TACTIC_KEYS.find((k) => !a.tactics.includes(k))!);
  while (g.phase !== 'done') g = nextRound(resolveRound(g, {}));
  const win = winners(g);
  g.agents.forEach((a, i) => {
    // 혼합전에서는 난이도 효과를 섞지 않도록 보통 AI만 집계
    if (AI === 'mixed' && levels[i] !== 'normal') return;
    const s = stat[missing[i]!]!;
    s.n++;
    s.score += a.score;
    s.sq += a.score * a.score;
    if (win.includes(i)) s.wins += 1 / win.length;
  });
  for (const r of g.results)
    for (const e of r.entries) {
      if (!e.offer?.tactic || e.status === 'invalid') continue;
      const u = use[e.offer.tactic]!;
      u.n++;
      if (e.status === 'won') {
        u.won++;
        u.fee += e.fee!;
      }
    }
}

const rows = TACTIC_KEYS.map((k) => {
  const s = stat[k]!;
  const others = TACTIC_KEYS.filter((x) => x !== k).map((x) => stat[x]!);
  const oMean = others.reduce((a, o) => a + o.score, 0) / others.reduce((a, o) => a + o.n, 0);
  const mean = s.score / s.n;
  const se = Math.sqrt((s.sq / s.n - mean * mean) / s.n);
  return {
    card: TACTICS[k as TacticKey].name,
    missingAgents: s.n,
    avgScoreWhenMissing: r2(mean),
    winRateWhenMissing: `${r2((s.wins / s.n) * 100)}%`,
    /** 이 카드를 가진 것의 가치 (억). 클수록 강한 카드 */
    value: r2(oMean - mean),
    se: r2(se),
  };
});
const uses = Object.entries(use).map(([k, u]) => ({
  card: TACTICS[k as TacticKey].name,
  uses: u.n,
  successRate: `${r2((u.won / (u.n || 1)) * 100)}%`,
  avgFeePerUse: r2(u.fee / (u.n || 1)),
}));

if (JSON_OUT) console.log(JSON.stringify({ config: { GAMES, N, SEED, AI }, value: rows, uses }, null, 2));
else {
  console.log(`# 전략 카드 가치 ${GAMES}판 · ${N}인 · AI ${AI} · seed ${SEED}`);
  console.table(rows);
  console.table(uses);
}
