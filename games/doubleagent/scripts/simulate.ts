/**
 * AI 대 AI 밸런스 시뮬레이션 (v6 규칙 엔진: 5라운드 × 1·2차 협상).
 *   npx tsx scripts/simulate.ts --games 2000 --players 3 --seed 42 [--ai easy|normal|mixed] [--rules k=v] [--model k=v]
 * mixed: floor(N/2)명은 normal, 나머지 easy. 게임마다 normal 자리을 회전시켜 자리 편향 상쇄
 * 협상 단위 집계(패스·무효 비율 등)의 분모는 자리 × 라운드 × 차수(STAGES)
 */
import { AI_MODEL, AI_TUNING, DEMANDS, EVENT_KEYS, GOALS, RULES, STAGES, TOTAL_ROUNDS, createGame, createRng, nextRound, resolveRound, winners } from '../src/engine';
import type { AiLevel, EventKey, GameState } from '../src/engine';

declare const process: { argv: string[] };

const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] && !args[i + 1]!.startsWith('--') ? args[i + 1]! : d;
};
const GAMES = Number(arg('games', '2000'));
const N = Number(arg('players', '3'));
const SEED = Number(arg('seed', '42'));
const AI = arg('ai', 'normal') as AiLevel | 'mixed';
/** mixed 에서 normal 자리 수 (기본 floor(N/2)) */
const NORMALS = Number(arg('normals', String(Math.floor(N / 2))));
if (!(N >= 3 && N <= 4)) throw new Error('--players must be 3~4');
// --tune save=0.3,deny=0 처럼 보통 AI 조정값 실험
for (const kv of arg('tune', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  if (!(k! in AI_TUNING)) throw new Error(`unknown tune ${k}`);
  (AI_TUNING as unknown as Record<string, number>)[k!] = Number(v);
}
for (const kv of arg('model', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  if (!(k! in AI_MODEL)) throw new Error(`unknown model ${k}`);
  (AI_MODEL as unknown as Record<string, number>)[k!] = Number(v);
}
for (const kv of arg('rules', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  if (!(k! in RULES)) throw new Error(`unknown rule ${k}`);
  (RULES as unknown as Record<string, unknown>)[k!] = v === 'null' ? null : v!.includes('/') ? v!.split('/').map(Number) : Number(v);
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const pct = (a: number, b: number) => (b ? `${r1((a / b) * 100)}%` : '-');
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const seatWins = Array<number>(N).fill(0);
const level = { easy: { seats: 0, wins: 0, score: 0 }, normal: { seats: 0, wins: 0, score: 0 } };
const totals: number[] = [];
const gaps: number[] = [];
const demandUse = Object.fromEntries(DEMANDS.map((d) => [d, { n: 0, won: 0, tieWon: 0 }]));
const eventFee = Object.fromEntries(EVENT_KEYS.map((k) => [k, { rounds: 0, fee: 0 }])) as Record<EventKey, { rounds: number; fee: number }>;
/** 차수별 집계 */
const st = [1, 2].map(() => ({ bids: 0, contested: 0, tieGroups: 0, tieBroken: 0, deals: 0, fee: 0, passes: 0, underCost: 0, signed: 0, dup: 0 }));
const roundCards = Array<number>(TOTAL_ROUNDS).fill(0);
let goalsDone = 0;
let goalPts = 0;
const goalStat = new Map<number, { n: number; done: number }>();
let feePts = 0;
let changed = 0;
let sharedWin = 0;
let marketMax = 0;
let leftCards = 0;

const seedRng = createRng(SEED);
for (let g = 0; g < GAMES; g++) {
  const levels: AiLevel[] = Array.from({ length: N }, (_, i) => (AI === 'mixed' ? ((i + g) % N < NORMALS ? 'normal' : 'easy') : AI));
  let s: GameState = createGame(
    levels.map((lv, i) => ({ name: `AI${i}`, kind: 'ai' as const, level: lv })),
    seedRng.int(2 ** 31),
  );
  while (s.phase !== 'done') {
    marketMax = Math.max(marketMax, s.market.length);
    const before = s.agents.reduce((a, x) => a + x.hand.length, 0);
    s = resolveRound(s, {});
    roundCards[s.round - 1]! += before - s.agents.reduce((a, x) => a + x.hand.length, 0);
    const r = s.results.at(-1)!;
    let roundFee = 0;
    for (const stage of [1, 2] as const) {
      const x = st[stage - 1]!;
      const byPlayer = new Map<number, number>();
      for (const e of r.entries.filter((e) => e.stage === stage)) {
        if (e.status === 'pass') x.passes++;
        if (e.status === 'invalid') {
          if (e.reason === 'under-cost') x.underCost++;
          else if (e.reason === 'signed') x.signed++;
          else if (e.reason === 'duplicate') x.dup++;
        }
        if (!e.offer || e.status === 'invalid') continue;
        x.bids++;
        demandUse[e.offer.demand]!.n++;
        byPlayer.set(e.offer.playerId, (byPlayer.get(e.offer.playerId) ?? 0) + 1);
        if (e.status === 'won') {
          x.deals++;
          x.fee += e.fee!;
          demandUse[e.offer.demand]!.won++;
          roundFee += e.fee!;
          // 같은 매력도 경쟁자가 있었는데 이긴 경우 = 동률을 카드로 깸
          const sameTier = r.entries.some((o) => o !== e && o.stage === stage && o.offer?.playerId === e.offer!.playerId && o.status === 'lost' && o.attract === e.attract);
          if (sameTier) {
            x.tieBroken++;
            demandUse[e.offer.demand]!.tieWon++;
          }
        }
      }
      for (const c of byPlayer.values()) if (c > 1) x.contested += c;
      x.tieGroups += new Set(r.entries.filter((e) => e.stage === stage && e.tied).map((e) => e.offer!.playerId)).size;
    }
    eventFee[r.event].rounds++;
    eventFee[r.event].fee += roundFee;
    s = nextRound(s);
  }
  leftCards += s.agents.reduce((a, x) => a + x.hand.length, 0);
  const totalsG = s.agents.map((a) => a.final!.total);
  const visible = s.agents.map((a) => a.score);
  const ws = winners(s);
  const visTop = Math.max(...visible);
  if (!ws.some((w) => visible[w] === visTop)) changed++;
  if (ws.length > 1) sharedWin++;
  for (const w of ws) seatWins[w]! += 1 / ws.length;
  s.agents.forEach((a, i) => {
    const lv = levels[i]!;
    level[lv].seats++;
    level[lv].score += a.final!.total;
    if (ws.includes(i)) level[lv].wins += 1 / ws.length;
    goalPts += a.final!.goalPoints;
    for (const r of a.final!.goals) {
      if (r.done) goalsDone++;
      const x = goalStat.get(r.goal) ?? { n: 0, done: 0 };
      x.n++;
      if (r.done) x.done++;
      goalStat.set(r.goal, x);
    }
    feePts += a.score;
  });
  totals.push(...totalsG);
  const sorted = [...totalsG].sort((a, b) => b - a);
  gaps.push(sorted[0]! - sorted[1]!);
}

const seats = GAMES * N;
/** 차수 하나의 협상 기회 수 (자리 × 라운드) */
const slots = seats * TOTAL_ROUNDS;
console.log(`# 시뮬레이션 N=${N} games=${GAMES} seed=${SEED} ai=${AI} (라운드 ${TOTAL_ROUNDS} × ${STAGES}차, 시장 ${N * RULES.marketPer + RULES.marketExtra}명)`);
console.log(`자리별 승률: ${seatWins.map((w) => pct(w, GAMES)).join(' / ')}`);
console.log(`평균 최종 점수 ${r1(mean(totals))} (수수료 ${r1(feePts / seats)} + 목표 ${r1(goalPts / seats)})`);
console.log(`1·2위 격차 평균 ${r1(mean(gaps))}, 공동 우승 ${pct(sharedWin, GAMES)}, 숨은 점수로 우승자가 바뀐 판 ${pct(changed, GAMES)}`);
st.forEach((x, k) => {
  console.log(
    `${k + 1}차: 라운드당 계약 ${r1(x.deals / GAMES / TOTAL_ROUNDS)}건 · 계약 1건 ${r1(x.fee / Math.max(1, x.deals))}억 · 경쟁 제안 비율 ${pct(x.contested, x.bids)} · 동률 상쇄 ${r1(x.tieGroups / GAMES)}회/판 · 동률을 카드로 깸 ${r1(x.tieBroken / GAMES)}회/판 · 패스 ${pct(x.passes, slots)} · 몸값 미달 ${pct(x.underCost, slots)} · 협상 무산 ${pct(x.signed, slots)} · 중복 ${pct(x.dup, slots)}`,
  );
});
console.log(`시장 최대 ${marketMax}명, 라운드별 카드 사용(1인당) ${roundCards.map((c) => r1(c / seats)).join('/')}, 남은 카드 ${r1(leftCards / seats)}장`);
console.log(`목표 달성률 ${pct(goalsDone, seats * RULES.goalsPerAgent)}: ${GOALS.map((g) => `${g.name} ${pct(goalStat.get(g.id)?.done ?? 0, goalStat.get(g.id)?.n ?? 0)}`).join(' · ')}`);
console.log(`요구 수수료 카드 (사용 / 계약률 / 동률 승): ${DEMANDS.map((d) => `${d} ${demandUse[d]!.n} / ${pct(demandUse[d]!.won, demandUse[d]!.n)} / ${demandUse[d]!.tieWon}`).join(' · ')}`);
console.log(`이벤트별 라운드 수수료: ${EVENT_KEYS.map((k) => `${k} ${r1(eventFee[k].fee / Math.max(1, eventFee[k].rounds))}`).join(' · ')}`);
if (AI === 'mixed') for (const lv of ['easy', 'normal'] as const) console.log(`  ${lv}: 1인당 승률 ${pct(level[lv].wins, level[lv].seats)}, 평균 ${r1(level[lv].score / Math.max(1, level[lv].seats))}`);
