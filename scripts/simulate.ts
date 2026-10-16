/**
 * AI 대 AI 밸런스 시뮬레이션 (v2 규칙 엔진).
 *   npx tsx scripts/simulate.ts --games 2000 --players 3 --seed 42 [--ai easy|normal|mixed]
 * mixed: floor(N/2)명은 normal, 나머지 easy. 게임마다 normal 좌석을 회전시켜 좌석 편향 상쇄
 */
import { AI_TUNING, DEMANDS, EVENT_KEYS, TOTAL_ROUNDS, createGame, createRng, finishGame, nextRound, resolveRound, winners } from '../src/core';
import type { AiLevel, EventKey, GameState } from '../src/core';

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
if (!(N >= 2 && N <= 4)) throw new Error('--players must be 2~4');
// --tune save=0.3,deny=0 처럼 보통 AI 조정값 실험
for (const kv of arg('tune', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  if (!(k! in AI_TUNING)) throw new Error(`unknown tune ${k}`);
  (AI_TUNING as Record<string, number>)[k!] = Number(v);
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const pct = (a: number, b: number) => (b ? `${r1((a / b) * 100)}%` : '-');
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const seatWins = Array<number>(N).fill(0);
const level = { easy: { seats: 0, wins: 0, score: 0 }, normal: { seats: 0, wins: 0, score: 0 } };
const totals: number[] = [];
const gaps: number[] = [];
const demandUse = Object.fromEntries(DEMANDS.map((d) => [d, { n: 0, won: 0 }]));
const eventFee = Object.fromEntries(EVENT_KEYS.map((k) => [k, { rounds: 0, fee: 0 }])) as Record<EventKey, { rounds: number; fee: number }>;
let bids = 0;
let contested = 0;
let tieGroups = 0;
let deals = 0;
let passes = 0;
let invalid = 0;
let exposed = 0;
let clubPts = 0;
let guessPts = 0;
let feePts = 0;
let changed = 0;
let sharedWin = 0;
let marketMax = 0;

const seedRng = createRng(SEED);
for (let g = 0; g < GAMES; g++) {
  const levels: AiLevel[] = Array.from({ length: N }, (_, i) => (AI === 'mixed' ? ((i + g) % N < NORMALS ? 'normal' : 'easy') : AI));
  let s: GameState = createGame(
    levels.map((lv, i) => ({ name: `AI${i}`, kind: 'ai' as const, level: lv })),
    seedRng.int(2 ** 31),
  );
  while (s.phase !== 'guess') {
    marketMax = Math.max(marketMax, s.market.length);
    s = resolveRound(s, {});
    const r = s.results.at(-1)!;
    const byPlayer = new Map<number, number>();
    let roundFee = 0;
    for (const e of r.entries) {
      if (e.status === 'pass') passes++;
      if (e.status === 'invalid') invalid++;
      if (!e.offer || e.status === 'invalid') continue;
      bids++;
      demandUse[e.offer.demand]!.n++;
      byPlayer.set(e.offer.playerId, (byPlayer.get(e.offer.playerId) ?? 0) + 1);
      if (e.status === 'won') {
        deals++;
        demandUse[e.offer.demand]!.won++;
        roundFee += e.fee!;
      }
    }
    for (const c of byPlayer.values()) if (c > 1) contested += c;
    const tiedPlayers = new Set(r.entries.filter((e) => e.tied).map((e) => e.offer!.playerId));
    tieGroups += tiedPlayers.size;
    eventFee[r.event].rounds++;
    eventFee[r.event].fee += roundFee;
    s = nextRound(s);
  }
  s = finishGame(s, {});
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
    if (a.final!.exposed) exposed++;
    clubPts += a.final!.clubPoints;
    guessPts += a.final!.guessPoints;
    feePts += a.score;
  });
  totals.push(...totalsG);
  const sorted = [...totalsG].sort((a, b) => b - a);
  gaps.push(sorted[0]! - sorted[1]!);
}

const seats = GAMES * N;
console.log(`# 시뮬레이션 N=${N} games=${GAMES} seed=${SEED} ai=${AI} (라운드 ${TOTAL_ROUNDS})`);
console.log(`좌석별 승률: ${seatWins.map((w) => pct(w, GAMES)).join(' / ')}`);
console.log(`평균 최종 점수 ${r1(mean(totals))} (수수료 ${r1(feePts / seats)} + 비밀 구단 ${r1(clubPts / seats)} + 지목 ${r1(guessPts / seats)})`);
console.log(`1·2위 격차 평균 ${r1(mean(gaps))}, 공동 우승 ${pct(sharedWin, GAMES)}, 숨은 점수로 우승자가 바뀐 판 ${pct(changed, GAMES)}`);
console.log(`라운드당 계약 ${r1(deals / GAMES / TOTAL_ROUNDS)}건, 경쟁 제안 비율 ${pct(contested, bids)}, 동률 상쇄 ${r1(tieGroups / GAMES)}회/판, 패스 ${pct(passes, seats * TOTAL_ROUNDS)}, 몸값 미달 ${pct(invalid, seats * TOTAL_ROUNDS)}, 시장 최대 ${marketMax}명`);
console.log(`비밀 구단 노출률 ${pct(exposed, seats)}`);
console.log(`요구 수수료 카드 (사용 / 계약률): ${DEMANDS.map((d) => `${d}억 ${demandUse[d]!.n} / ${pct(demandUse[d]!.won, demandUse[d]!.n)}`).join(' · ')}`);
console.log(`이벤트별 라운드 수수료: ${EVENT_KEYS.map((k) => `${k} ${r1(eventFee[k].fee / Math.max(1, eventFee[k].rounds))}`).join(' · ')}`);
if (AI === 'mixed') for (const lv of ['easy', 'normal'] as const) console.log(`  ${lv}: 1석당 승률 ${pct(level[lv].wins, level[lv].seats)}, 평균 ${r1(level[lv].score / Math.max(1, level[lv].seats))}`);
