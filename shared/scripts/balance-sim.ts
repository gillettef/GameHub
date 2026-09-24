/**
 * 카드 밸런싱용 자동 대국 시뮬레이터. 실제 게임은 아니고, 종족 간 승률·점수를 가늠하기 위한
 * 휴리스틱 봇끼리의 대국이다 — AI 서비스(ai/astral_ai)와는 무관하게 shared/src/engine 을 직접
 * 순수 함수로 호출한다(서버·네트워크 없음, 빠르게 많이 돌리기 위해서).
 *
 *   npx tsx shared/scripts/balance-sim.ts [게임 수]
 *
 * 봇 정책: 매 배치 기회마다 손패 카드 × 놓을 수 있는 칸 조합을 전부(칸이 많으면 표본) 훑어
 * "비용 대비 가치 + 상황 보너스(사거리 안 적, 과부하 이웃, 광맥)"가 가장 높은 곳에 놓는다.
 * 더 이상 값어치 있는 수가 없으면 패스한다. 게임 내 결정성 RNG(rngSeed)와는 별도로,
 * 시뮬레이터 자신의 선택(칸 표본 추출)은 이 파일만의 시드 PRNG를 쓴다.
 * 2026-09-24: 덱 빌딩 자유 선택이 폐지되어 종족마다 고정 덱 하나뿐이라, 더 이상 덱 구성을
 * 무작위로 고를 필요가 없다 — 종족만 정하면 `buildDeck`이 나머지를 정한다.
 */
import { applyAction, canPlay, createInitialState, createPlayer, joinPlayer, legalCells, terrainAt } from '../src/engine/index.js';
import { hexDistance } from '../src/engine/sight.js';
import { RACES, getSpec, mapsForPlayers } from '../src/data/index.js';
import type { CardId, CardSpec, GameState, PlayerId, Position, RaceId } from '../src/types/index.js';

// --- 시뮬레이터 전용 시드 PRNG (게임 엔진의 rngSeed 와 무관) ---------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;

function sample<T>(items: readonly T[], n: number, rand: Rand): T[] {
  if (items.length <= n) return [...items];
  const pool = [...items];
  const out: T[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rand() * pool.length);
    out.push(pool[idx] as T);
    pool.splice(idx, 1);
  }
  return out;
}

// --- 휴리스틱 봇 -------------------------------------------------------------------------

const MAX_CELLS_PER_CARD = 24;

/** 카드 자체의 비용 대비 가치. 위치와 무관한 부분 */
function cardValue(spec: CardSpec): number {
  const atk = spec.attack > 0 ? spec.attack * (spec.range || 1) * 1.6 : 0;
  // 시야 가중치를 높게 둔다: 그렇지 않으면 봇이 눈앞의 좁은 시야만 값싼 카드로 채우다가
  // 더 놓을 칸이 없어 금방 전원 패스로 게임이 끝나버려, 후반에야 강해지는 종족(오토마타)이
  // 자기 카드를 제대로 못 써보고 불리하게 평가된다.
  const base = spec.score * 3 + spec.production * 4 + spec.sight * 3.5 + spec.hp * 0.12 + atk;
  return base / Math.max(spec.cost, 1);
}

/** 놓을 칸에 따라 달라지는 보너스: 사거리 안 적, 과부하 이웃, 광맥 위 생산 건물 */
function positionalBonus(state: GameState, playerId: PlayerId, spec: CardSpec, pos: Position): number {
  let bonus = 0;
  if (spec.attack > 0) {
    const enemiesInRange = state.markers.filter((m) => m.ownerId !== playerId && hexDistance(pos, m.pos) <= spec.range).length;
    bonus += enemiesInRange * 6;
  }
  if (spec.kind === 'building') {
    if (spec.keywords.includes('overclock')) {
      const neighbors = state.markers.filter((m) => m.ownerId === playerId && m.kind === 'building' && hexDistance(pos, m.pos) <= 1).length;
      bonus += neighbors * 3;
    }
    if (spec.production > 0 && terrainAt(state.board, pos) === 'vein') bonus += 3;
  }
  return bonus;
}

/** 내 턴: 값어치 있는 배치가 더 없을 때까지 반복하고 패스로 턴을 넘긴다 */
function botTurn(state: GameState, playerId: PlayerId, rand: Rand): GameState {
  let s = state;
  for (let guard = 0; guard < 40 && s.phase === 'playing' && s.currentPlayerId === playerId; guard++) {
    const player = s.players.find((p) => p.id === playerId)!;
    const handIds = [...new Set(player.hand)];
    let best: { cardId: CardId; pos: Position; val: number } | null = null;
    for (const cardId of handIds) {
      if (!canPlay(s, playerId, cardId)) continue;
      const spec = getSpec(cardId);
      const all = legalCells(s, playerId, cardId);
      const cells = sample(all, MAX_CELLS_PER_CARD, rand);
      const value = cardValue(spec);
      for (const pos of cells) {
        const val = value + positionalBonus(s, playerId, spec, pos);
        if (!best || val > best.val) best = { cardId, pos, val };
      }
    }
    if (!best) break;
    const r = applyAction(s, { type: 'PLACE', playerId, cardId: best.cardId, pos: best.pos });
    if (r.error) break; // canPlay/legalCells 로 이미 걸러졌으니 정상 경로에선 발생하지 않는다
    s = r.state;
  }
  if (s.phase === 'playing' && s.currentPlayerId === playerId) {
    s = applyAction(s, { type: 'PASS', playerId }).state;
  }
  return s;
}

// --- 한 판 실행 ---------------------------------------------------------------------------

export interface GameSummary {
  mapId: string;
  seats: RaceId[];
  winnerSeat: number | null;
  winnerRace: RaceId | null;
  reason: string | null;
  rounds: number;
  scores: { seat: number; race: RaceId; total: number; territory: number; markers: number }[];
}

function playGame(mapId: string, races: RaceId[], engineSeed: number, simSeed: number): GameSummary {
  const rand = mulberry32(simSeed);
  let s = createInitialState('sim', mapId, engineSeed);
  for (let i = 0; i < races.length; i++) {
    s = joinPlayer(s, createPlayer(`p${i}`, `P${i}`)).state;
  }
  for (let i = 0; i < races.length; i++) {
    const r = applyAction(s, { type: 'SELECT_RACE', playerId: `p${i}`, race: races[i] as RaceId });
    if (r.error) throw new Error(`SELECT_RACE 실패: ${r.error}`);
    s = r.state;
  }
  for (let i = 0; i < races.length; i++) {
    s = applyAction(s, { type: 'READY', playerId: `p${i}` }).state;
  }
  if (s.phase !== 'playing') throw new Error('게임이 시작되지 않았습니다');

  for (let turns = 0; s.phase === 'playing' && turns < 3000; turns++) {
    const pid = s.currentPlayerId as PlayerId;
    s = botTurn(s, pid, rand);
  }
  if (s.phase !== 'finished') throw new Error(`게임이 끝나지 않았습니다 (턴 상한): ${mapId} ${races.join(',')}`);

  const result = s.result!;
  const winnerId = result.ranking[0] ?? null;
  const winnerSeat = winnerId ? s.players.find((p) => p.id === winnerId)!.seat : null;
  return {
    mapId,
    seats: races,
    winnerSeat,
    winnerRace: winnerSeat !== null ? (races[winnerSeat] as RaceId) : null,
    reason: result.reason,
    rounds: s.round,
    scores: s.players.map((p) => ({
      seat: p.seat,
      race: races[p.seat] as RaceId,
      total: result.scores[p.id]?.total ?? 0,
      territory: result.scores[p.id]?.territory ?? 0,
      markers: result.scores[p.id]?.markers ?? 0,
    })),
  };
}

// --- 대진표 구성 (2인, 종족 5개의 모든 조합 10쌍 × 좌석 순서 2가지, 2026-09-24 5종족 확장) -----

const RACE_IDS = RACES.map((r) => r.id);
const PAIRS: [RaceId, RaceId][] = [];
for (let i = 0; i < RACE_IDS.length; i++) {
  for (let j = i + 1; j < RACE_IDS.length; j++) {
    PAIRS.push([RACE_IDS[i] as RaceId, RACE_IDS[j] as RaceId]);
  }
}
const TWO_PLAYER_MAPS = mapsForPlayers(2).map((m) => m.id);

function buildSchedule(totalGames: number): { mapId: string; races: RaceId[] }[] {
  const configs: RaceId[][] = [];
  for (const [a, b] of PAIRS) {
    configs.push([a, b]);
    configs.push([b, a]);
  }
  const schedule: { mapId: string; races: RaceId[] }[] = [];
  for (let i = 0; i < totalGames; i++) {
    const races = configs[i % configs.length] as RaceId[];
    const mapId = TWO_PLAYER_MAPS[i % TWO_PLAYER_MAPS.length] as string;
    schedule.push({ mapId, races });
  }
  return schedule;
}

// --- 실행 + 집계 ---------------------------------------------------------------------------

function main() {
  const totalGames = Number(process.argv[2] ?? 100);
  const schedule = buildSchedule(totalGames);
  const summaries: GameSummary[] = [];
  let failures = 0;

  for (let i = 0; i < schedule.length; i++) {
    const { mapId, races } = schedule[i] as { mapId: string; races: RaceId[] };
    try {
      summaries.push(playGame(mapId, races, 10_000 + i, 90_000 + i));
    } catch (e) {
      failures++;
      console.error(`게임 ${i} 실패 (${mapId}, ${races.join(' vs ')}):`, (e as Error).message);
    }
  }

  const wins = new Map<RaceId, number>();
  const games = new Map<RaceId, number>();
  const scoreSum = new Map<RaceId, number>();
  const territorySum = new Map<RaceId, number>();
  const markerSum = new Map<RaceId, number>();
  const roundsSum = new Map<RaceId, number>();
  const reasonCount = new Map<string, number>();
  for (const race of RACE_IDS) {
    wins.set(race, 0);
    games.set(race, 0);
    scoreSum.set(race, 0);
    territorySum.set(race, 0);
    markerSum.set(race, 0);
    roundsSum.set(race, 0);
  }

  for (const g of summaries) {
    reasonCount.set(g.reason ?? 'unknown', (reasonCount.get(g.reason ?? 'unknown') ?? 0) + 1);
    for (const row of g.scores) {
      games.set(row.race, (games.get(row.race) ?? 0) + 1);
      scoreSum.set(row.race, (scoreSum.get(row.race) ?? 0) + row.total);
      territorySum.set(row.race, (territorySum.get(row.race) ?? 0) + row.territory);
      markerSum.set(row.race, (markerSum.get(row.race) ?? 0) + row.markers);
      roundsSum.set(row.race, (roundsSum.get(row.race) ?? 0) + g.rounds);
    }
    if (g.winnerRace) wins.set(g.winnerRace, (wins.get(g.winnerRace) ?? 0) + 1);
  }

  console.log(`\n=== 밸런스 시뮬레이션: ${summaries.length}판 완료 (실패 ${failures}) ===\n`);
  console.log('종족'.padEnd(10), '판수'.padEnd(6), '승률'.padEnd(8), '평균 점수'.padEnd(10), '영토/마커'.padEnd(12), '평균 라운드');
  for (const race of RACE_IDS) {
    const n = games.get(race) ?? 0; // 이 종족이 참가한 2인전 게임 수(게임당 종족 1회 등장)
    const w = wins.get(race) ?? 0;
    const winRate = n > 0 ? ((w / n) * 100).toFixed(1) : '-';
    const avgScore = n > 0 ? ((scoreSum.get(race) ?? 0) / n).toFixed(1) : '-';
    const avgT = n > 0 ? ((territorySum.get(race) ?? 0) / n).toFixed(1) : '-';
    const avgM = n > 0 ? ((markerSum.get(race) ?? 0) / n).toFixed(1) : '-';
    const avgR = n > 0 ? ((roundsSum.get(race) ?? 0) / n).toFixed(1) : '-';
    console.log(
      race.padEnd(10),
      String(n).padEnd(6),
      `${winRate}%`.padEnd(8),
      avgScore.padEnd(10),
      `${avgT}/${avgM}`.padEnd(12),
      avgR,
    );
  }
  console.log('\n종료 사유:', Object.fromEntries(reasonCount));
}

main();
