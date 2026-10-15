/**
 * AI 대 AI 밸런스 시뮬레이션.
 *   npx tsx scripts/simulate.ts --games 2000 --players 3 --seed 42 [--ai easy|normal|mixed] [--json]
 * mixed: floor(N/2)명은 normal, 나머지 easy. 게임마다 normal 좌석을 회전시켜 좌석 편향 상쇄
 */
import {
  CLUBS,
  EVENTS,
  EVENT_KEYS,
  DEMANDS,
  PLAYERS,
  TACTICS,
  TACTIC_KEYS,
  HIJACK,
  createGame,
  marketSize,
  createRng,
  nextRound,
  resolveRound,
  winners,
} from '../src/core';
import type { AiLevel, EventKey, GameState } from '../src/core';

// 브라우저용 tsconfig에 Node 타입을 섞지 않기 위한 최소 선언
declare const process: { argv: string[] };

const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] && !args[i + 1]!.startsWith('--') ? args[i + 1]! : d;
};
const GAMES = Number(arg('games', '2000'));
const N = Number(arg('players', '3'));
const SEED = Number(arg('seed', '42'));
const AI = arg('ai', 'easy') as AiLevel | 'mixed';
const JSON_OUT = args.includes('--json');
if (!(N >= 2 && N <= 4)) throw new Error('--players must be 2~4');
if (!['easy', 'normal', 'mixed'].includes(AI)) throw new Error('--ai must be easy|normal|mixed');

const r2 = (x: number) => Math.round(x * 100) / 100;
const pct = (a: number, b: number) => (b ? `${r2((a / b) * 100)}%` : '-');
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const tally = () => ({ n: 0, won: 0, fee: 0 });

const seatWins = Array<number>(N).fill(0);
const seatScore = Array<number>(N).fill(0);
const levelStat: Record<AiLevel, { seats: number; wins: number; score: number }> = {
  easy: { seats: 0, wins: 0, score: 0 },
  normal: { seats: 0, wins: 0, score: 0 },
};
const finals: number[] = [];
const gaps: number[] = [];
const tactic = Object.fromEntries([...TACTIC_KEYS, HIJACK, 'none'].map((k) => [k, tally()]));
const feeCard = Object.fromEntries(DEMANDS.map((f) => [f, tally()]));
const playerStat = PLAYERS.map(() => ({ deals: 0, fee: 0, bids: 0 }));
const clubPick = CLUBS.map(() => 0);
const eventStat = Object.fromEntries(EVENT_KEYS.map((k) => [k, { rounds: 0, fee: 0 }])) as Record<EventKey, { rounds: number; fee: number }>;
let contested = 0;
/** 경쟁(같은 차수·같은 선수에 2건 이상)에 들어간 제안 수 */
let offersContested = 0;
let offersCompeting = 0;
let ties = 0;
let groups = 0;
let noOffer = 0;
let offers = 0;
let invalid = 0;
let voided = 0;
let hijackTry = 0;
let hijackOk = 0;
let shortMarket = 0;
let rounds = 0;
const stageWon = { 1: 0, 2: 0 };

const master = createRng(SEED);
for (let gi = 0; gi < GAMES; gi++) {
  const levels: AiLevel[] = Array.from({ length: N }, (_, i) =>
    AI === 'mixed' ? ((i + gi) % N < Math.floor(N / 2) ? 'normal' : 'easy') : AI,
  );
  let g: GameState = createGame(levels.map((level, i) => ({ name: `AI${i}`, kind: 'ai' as const, level })), master.int(0x7fffffff));
  while (g.phase !== 'done') {
    if (g.market.length < marketSize(N).players) shortMarket++;
    g = nextRound(resolveRound(g, {}));
  }

  const scores = g.agents.map((a) => a.score);
  const win = winners(g);
  win.forEach((i) => {
    seatWins[i]! += 1 / win.length;
    levelStat[levels[i]!].wins += 1 / win.length;
  });
  scores.forEach((s, i) => {
    seatScore[i]! += s;
    finals.push(s);
    levelStat[levels[i]!].seats++;
    levelStat[levels[i]!].score += s;
  });
  const sorted = [...scores].sort((a, b) => b - a);
  gaps.push(sorted[0]! - sorted[1]!);

  for (const r of g.results) {
    const es = eventStat[r.event];
    es.rounds++;
    rounds++;
    const byPlayer = new Map<string, number[]>();
    for (const e of r.entries) {
      if (e.status === 'none') noOffer++;
      if (!e.offer) continue;
      offers++;
      if (e.status === 'invalid') {
        invalid++;
        continue;
      }
      if (e.status === 'void') {
        voided++;
        continue;
      }
      if (e.stage === 2 && e.offer.tactic === HIJACK && (e.status === 'won' ? e.hijack : e.hijackFailed)) {
        hijackTry++;
        if (e.status === 'won') hijackOk++;
      }
      if (e.status === 'won') stageWon[e.stage]++;
      const won = e.status === 'won';
      const fee = won ? e.fee! : 0;
      es.fee += fee;
      for (const t of [tactic[e.offer.tactic ?? 'none']!, feeCard[e.offer.demand]!]) {
        t.n++;
        t.won += won ? 1 : 0;
        t.fee += fee;
      }
      const ps = playerStat[e.offer.playerId]!;
      ps.bids++;
      if (won) {
        ps.deals++;
        ps.fee += fee;
      }
      clubPick[e.offer.clubId]!++;
      const gk = `${e.stage}:${e.offer.playerId}`;
      byPlayer.set(gk, [...(byPlayer.get(gk) ?? []), e.attract!]);
    }
    for (const atts of byPlayer.values()) {
      groups++;
      offersCompeting += atts.length;
      if (atts.length > 1) {
        contested++;
        offersContested += atts.length;
        const top = Math.max(...atts);
        if (atts.filter((a) => a === top).length > 1) ties++;
      }
    }
  }
}

const report = {
  config: { games: GAMES, players: N, seed: SEED, ai: AI },
  seats: seatWins.map((w, i) => ({ seat: i + 1, winRate: pct(w, GAMES), avgScore: r2(seatScore[i]! / GAMES) })),
  levels:
    AI === 'mixed'
      ? (['easy', 'normal'] as const).map((l) => ({
          level: l,
          winRatePerSeat: pct(levelStat[l].wins, levelStat[l].seats),
          avgScore: r2(levelStat[l].score / levelStat[l].seats),
        }))
      : undefined,
  score: { mean: r2(mean(finals)), sd: r2(sd(finals)), avgGap12: r2(mean(gaps)) },
  tactics: Object.entries(tactic).map(([k, t]) => ({
    tactic: k === 'none' ? '(없음)' : TACTICS[k as keyof typeof TACTICS].name,
    uses: t.n,
    successRate: pct(t.won, t.n),
    avgFeePerUse: r2(t.fee / (t.n || 1)),
  })),
  demandCards: Object.entries(feeCard).map(([f, t]) => ({ demand: `요구 ${f}`, uses: t.n, successRate: pct(t.won, t.n), avgFeePerUse: r2(t.fee / (t.n || 1)) })),
  players: PLAYERS.map((p, i) => ({
    player: `${p.name}(${p.pos},몸값${p.cost},기본${p.base})`,
    bids: playerStat[i]!.bids,
    deals: playerStat[i]!.deals,
    avgFee: r2(playerStat[i]!.fee / (playerStat[i]!.deals || 1)),
  })),
  clubs: CLUBS.map((c, i) => ({ club: c.name, picks: clubPick[i]! })),
  events: EVENT_KEYS.map((k) => ({ event: EVENTS[k].name, rounds: eventStat[k].rounds, avgRoundFee: r2(eventStat[k].fee / (eventStat[k].rounds || 1)) })),
  rates: {
    contested: pct(contested, groups),
    offersFacingRival: pct(offersContested, offersCompeting),
    tieAmongContested: pct(ties, contested),
    noOfferRate: pct(noOffer, noOffer + offers),
    invalidRate: pct(invalid, offers),
    voidRate: pct(voided, offers),
    dealsPerRound: r2((stageWon[1] + stageWon[2]) / (rounds || 1)),
    stage1Deals: stageWon[1],
    stage2Deals: stageWon[2],
    hijackVsContract: hijackTry,
    hijackSuccess: pct(hijackOk, hijackTry),
    shortMarketRounds: pct(shortMarket, rounds),
  },
};

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`# 시뮬레이션 ${GAMES}판 · ${N}인 · AI ${AI} · seed ${SEED}`);
  for (const [k, v] of Object.entries(report)) {
    if (k === 'config' || v === undefined) continue;
    console.log(`\n## ${k}`);
    if (Array.isArray(v)) console.table(v);
    else console.table([v]);
  }
}
