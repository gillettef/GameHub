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
import { applyAction, canPlay, computeIncome, createInitialState, createPlayer, joinPlayer, legalCells, terrainAt } from '../src/engine/index.js';
import { hexDistance } from '../src/engine/sight.js';
import { FIXED_DECKS, RACES, getSpec, mapsForPlayers } from '../src/data/index.js';
import { readFileSync } from 'node:fs';
import type { CardId, CardSpec, GameState, PlayerId, Position, RaceId } from '../src/types/index.js';

// --- 수치 오버라이드 (탐색용) -----------------------------------------------------------------
// SIM_OVERRIDES=<json 파일 경로> 로 카드 수치·고정 덱을 파일 수정 없이 덮어써 본다.
//   { "cards": { "<id>": { "cost": 3, "hp": 5 } }, "decks": { "<race>": { "<id>": 개수, ... } } }
// 확정한 값은 shared/src/data/cards.ts 와 Rules.md 에 옮긴다.
const overridePath = process.env.SIM_OVERRIDES;
if (overridePath) {
  const o = JSON.parse(readFileSync(overridePath, 'utf-8')) as { cards?: Record<string, Partial<CardSpec>>; decks?: Record<string, Record<string, number>> };
  for (const [id, patch] of Object.entries(o.cards ?? {})) Object.assign(getSpec(id), patch);
  for (const [race, deck] of Object.entries(o.decks ?? {})) (FIXED_DECKS as Record<string, Record<string, number>>)[race] = deck;
}

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

// --- 종족 컨셉 지표 ----------------------------------------------------------------------------
// 승률만으로는 "이 종족이 컨셉대로 이기는가"를 알 수 없어서, 대국 중 종족별 행동을 함께 집계한다.
//   - 물량(swarm): 배치 평균 비용, 라운드 5/10/15의 마커 수, 잃은 마커 수
//   - 침투(swarm·shade): 적 마커 거리 1 이내에 침투 카드를 놓은 비율
//   - 축적(automata): 라운드 5/10/15의 턴 수입
//   - 은신(shade): 전투가 났을 때 은신 마커와 비은신 마커의 피격률
//   - 포격(siege): 전투 한 번에 공격 유닛 하나가 때리는 적 수, 선제 타격 비율
const CHECKPOINTS = [5, 10, 15] as const;

interface RaceMetrics {
  games: number;
  placements: number;
  costSum: number;
  unitPlacements: number;
  infiltratePlacements: number;
  infiltrateAdjacent: number;
  lostMarkers: number;
  veilExposed: number;
  veilHit: number;
  plainExposed: number;
  plainHit: number;
  hitEnemies: number;
  activeAttackers: number;
  rangeSum: number;
  firstStrikeGames: number;
  firstStrikeWins: number;
  firstDamageRoundSum: number;
  firstDamageGames: number;
  markersAt: Record<number, { sum: number; n: number }>;
  incomeAt: Record<number, { sum: number; n: number }>;
}

function newMetrics(): RaceMetrics {
  return {
    games: 0, placements: 0, costSum: 0, unitPlacements: 0, infiltratePlacements: 0, infiltrateAdjacent: 0,
    lostMarkers: 0, veilExposed: 0, veilHit: 0, plainExposed: 0, plainHit: 0, hitEnemies: 0, activeAttackers: 0,
    rangeSum: 0, firstStrikeGames: 0, firstStrikeWins: 0, firstDamageRoundSum: 0, firstDamageGames: 0,
    markersAt: Object.fromEntries(CHECKPOINTS.map((r) => [r, { sum: 0, n: 0 }])),
    incomeAt: Object.fromEntries(CHECKPOINTS.map((r) => [r, { sum: 0, n: 0 }])),
  };
}

const METRICS = new Map<RaceId, RaceMetrics>();
function metricsOf(race: RaceId): RaceMetrics {
  let m = METRICS.get(race);
  if (!m) {
    m = newMetrics();
    METRICS.set(race, m);
  }
  return m;
}

/** 한 판 안에서만 쓰는 임시 기록 */
interface GameTrack {
  races: RaceId[];
  firstDamageTurn: Map<PlayerId, number>;
  checkpointDone: Set<string>;
}
let TRACK: GameTrack | null = null;

function raceOfPlayer(playerId: PlayerId): RaceId {
  return (TRACK as GameTrack).races[Number(playerId.slice(1))] as RaceId;
}

function recordPlacement(before: GameState, playerId: PlayerId, spec: CardSpec, pos: Position): void {
  const m = metricsOf(raceOfPlayer(playerId));
  m.placements++;
  m.costSum += spec.cost;
  if (spec.kind === 'unit') m.unitPlacements++;
  if (spec.keywords.includes('infiltrate')) {
    m.infiltratePlacements++;
    if (before.markers.some((o) => o.ownerId !== playerId && hexDistance(pos, o.pos) <= 1)) m.infiltrateAdjacent++;
  }
}

/** 내 턴이 끝나며(전투 처리 직후) 상태가 바뀐 결과를 종족 지표로 옮긴다 */
function recordTurnEnd(pre: GameState, post: GameState, playerId: PlayerId): void {
  const track = TRACK as GameTrack;
  const me = metricsOf(raceOfPlayer(playerId));

  for (const r of CHECKPOINTS) {
    const key = `${playerId}:${r}`;
    if (pre.round === r && !track.checkpointDone.has(key)) {
      track.checkpointDone.add(key);
      me.markersAt[r]!.sum += pre.markers.filter((k) => k.ownerId === playerId && k.kind !== 'core').length;
      me.markersAt[r]!.n++;
      me.incomeAt[r]!.sum += computeIncome(pre, playerId).total;
      me.incomeAt[r]!.n++;
    }
  }

  const postById = new Map(post.markers.map((k) => [k.id, k]));
  const victims = pre.markers.filter((k) => k.ownerId !== playerId);
  const hit = new Set(
    victims.filter((k) => {
      const after = postById.get(k.id);
      return !after || after.hp < k.hp;
    }),
  );
  if (hit.size === 0) return;

  if (!track.firstDamageTurn.has(playerId)) {
    track.firstDamageTurn.set(playerId, pre.turn);
    me.firstDamageRoundSum += pre.round;
    me.firstDamageGames++;
  }
  // 전투가 난 턴에 한해, 피해자 쪽 은신/비은신 마커의 피격률과 손실을 센다
  for (const k of victims) {
    const veil = getSpec(k.specId).keywords.includes('veil');
    const vm = metricsOf(raceOfPlayer(k.ownerId));
    const wasHit = hit.has(k);
    if (veil) {
      vm.veilExposed++;
      if (wasHit) vm.veilHit++;
    } else if (k.kind !== 'core') {
      vm.plainExposed++;
      if (wasHit) vm.plainHit++;
    }
    if (!postById.has(k.id)) vm.lostMarkers++;
  }
  // 공격 측: 사거리 안에 적이 있는 공격 마커 수 대비 실제 피해를 입은 적 수
  const attackers = pre.markers.filter((k) => {
    if (k.ownerId !== playerId) return false;
    const sp = getSpec(k.specId);
    return sp.attack > 0 && victims.some((v) => hexDistance(k.pos, v.pos) <= sp.range);
  });
  me.hitEnemies += hit.size;
  me.activeAttackers += attackers.length;
  for (const k of attackers) me.rangeSum += getSpec(k.specId).range;
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
    recordPlacement(s, playerId, getSpec(best.cardId), best.pos);
    s = r.state;
  }
  if (s.phase === 'playing' && s.currentPlayerId === playerId) {
    const pre = s;
    s = applyAction(s, { type: 'PASS', playerId }).state;
    recordTurnEnd(pre, s, playerId);
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
  const track: GameTrack = { races, firstDamageTurn: new Map(), checkpointDone: new Set() };
  TRACK = track;
  for (const r of races) metricsOf(r).games++;
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

  // 선제 타격: 먼저 적에게 피해를 준 쪽 (서로 같은 턴일 수는 없다)
  const t0 = track.firstDamageTurn.get('p0');
  const t1 = track.firstDamageTurn.get('p1');
  if (t0 !== undefined && t1 !== undefined && t0 !== t1) {
    for (const [pid, mine, theirs] of [['p0', t0, t1], ['p1', t1, t0]] as const) {
      const mm = metricsOf(raceOfPlayer(pid));
      mm.firstStrikeGames++;
      if (mine < theirs) mm.firstStrikeWins++;
    }
  }

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
  // SIM_PAIR="a,b" 이면 그 한 쌍만 돌린다(원인 분석용)
  const only = process.env.SIM_PAIR?.split(',');
  for (const [a, b] of PAIRS) {
    if (only && !(only.includes(a) && only.includes(b))) continue;
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

  // 종족 컨셉 지표 (위 "종족 컨셉 지표" 주석 참고)
  const div = (a: number, b: number, d = 1): string => (b > 0 ? (a / b).toFixed(d) : '-');
  const pct = (a: number, b: number): string => (b > 0 ? `${((a / b) * 100).toFixed(0)}%` : '-');
  console.log('\n종족 컨셉 지표:');
  console.log(
    '종족'.padEnd(10), '배치비용'.padEnd(9), '유닛비율'.padEnd(9), '침투밀착'.padEnd(9), '잃은마커'.padEnd(9),
    '첫피해R'.padEnd(9), '선제타격'.padEnd(9), '적피해/공격자'.padEnd(13), '평균사거리',
  );
  for (const race of RACE_IDS) {
    const m = metricsOf(race);
    console.log(
      race.padEnd(10),
      div(m.costSum, m.placements, 2).padEnd(9),
      pct(m.unitPlacements, m.placements).padEnd(9),
      pct(m.infiltrateAdjacent, m.infiltratePlacements).padEnd(9),
      div(m.lostMarkers, m.games).padEnd(9),
      div(m.firstDamageRoundSum, m.firstDamageGames).padEnd(9),
      pct(m.firstStrikeWins, m.firstStrikeGames).padEnd(9),
      div(m.hitEnemies, m.activeAttackers, 2).padEnd(13),
      div(m.rangeSum, m.activeAttackers, 2),
    );
  }
  console.log('\n라운드별 마커 수(코어 제외) / 턴 수입:');
  console.log('종족'.padEnd(10), ...CHECKPOINTS.map((r) => `R${r}`.padEnd(14)));
  for (const race of RACE_IDS) {
    const m = metricsOf(race);
    console.log(race.padEnd(10), ...CHECKPOINTS.map((r) => `${div(m.markersAt[r]!.sum, m.markersAt[r]!.n)} / ${div(m.incomeAt[r]!.sum, m.incomeAt[r]!.n)}`.padEnd(14)));
  }
  console.log('\n전투가 난 턴의 은신 마커 vs 비은신 마커 피격률:');
  for (const race of RACE_IDS) {
    const m = metricsOf(race);
    if (m.veilExposed === 0) continue;
    console.log(race.padEnd(10), `은신 ${pct(m.veilHit, m.veilExposed)} (n=${m.veilExposed})`, `비은신 ${pct(m.plainHit, m.plainExposed)} (n=${m.plainExposed})`);
  }

  // 쌍별 승률 행렬: 행 종족이 열 종족을 상대로 이긴 비율(좌석 순서·맵 섞임, 2인전 전용).
  // 상성 설계(목표 45:55)와 무상성(목표 50:50)을 확인하는 용도다.
  const pairWins = new Map<string, number>();
  const pairGames = new Map<string, number>();
  for (const g of summaries) {
    const [a, b] = g.seats as [RaceId, RaceId];
    const key = [a, b].sort().join('|');
    pairGames.set(key, (pairGames.get(key) ?? 0) + 1);
    if (g.winnerRace) pairWins.set(`${g.winnerRace}>${g.winnerRace === a ? b : a}`, (pairWins.get(`${g.winnerRace}>${g.winnerRace === a ? b : a}`) ?? 0) + 1);
  }
  // 목표 상성: 순환 swarm>siege>automata>shade>coalition>swarm 은 55:45, 나머지 쌍은 50:50
  const CYCLE = ['swarm', 'siege', 'automata', 'shade', 'coalition'];
  let sq = 0;
  let pairCount = 0;
  const lines: string[] = [];
  for (let i = 0; i < RACE_IDS.length; i++) {
    for (let j = i + 1; j < RACE_IDS.length; j++) {
      const a = RACE_IDS[i] as string;
      const b = RACE_IDS[j] as string;
      const n = pairGames.get([a, b].sort().join('|')) ?? 0;
      if (n === 0) continue;
      const rate = ((pairWins.get(`${a}>${b}`) ?? 0) / n) * 100;
      const ia = CYCLE.indexOf(a);
      const ib = CYCLE.indexOf(b);
      const target = (ia + 1) % 5 === ib ? 55 : (ib + 1) % 5 === ia ? 45 : 50;
      sq += (rate - target) ** 2;
      pairCount++;
      lines.push(`${a} vs ${b}: ${rate.toFixed(1)}% (목표 ${target}%, 편차 ${(rate - target).toFixed(1)})`);
    }
  }
  const rms = Math.sqrt(sq / Math.max(pairCount, 1));
  const rates = RACE_IDS.map((r) => ((wins.get(r) ?? 0) / Math.max(games.get(r) ?? 1, 1)) * 100);
  console.log('\n쌍별 목표 대비 (a가 b를 이긴 %):');
  console.log(lines.join('\n'));
  console.log(`쌍별 RMS 오차 ${rms.toFixed(2)}%p / 종족 전체 승률 범위 ${Math.min(...rates).toFixed(1)}~${Math.max(...rates).toFixed(1)}%`);
  // 튜닝 도구가 읽는 기계 판독 줄: 쌍별 "a>b" 승률과 종족 전체 승률
  const machine: Record<string, number> = {};
  for (const a of RACE_IDS) {
    machine[`all:${a}`] = ((wins.get(a) ?? 0) / Math.max(games.get(a) ?? 1, 1)) * 100;
    for (const b of RACE_IDS) {
      if (a === b) continue;
      const n = pairGames.get([a, b].sort().join('|')) ?? 0;
      if (n > 0) machine[`${a}>${b}`] = ((pairWins.get(`${a}>${b}`) ?? 0) / n) * 100;
    }
  }
  console.log(`RESULT_JSON ${JSON.stringify(machine)}`);
  console.log('\n쌍별 승률 (행이 열을 이긴 %, 무승부 제외 없이 판수 기준)');
  console.log(''.padEnd(10), ...RACE_IDS.map((r) => r.padEnd(10)));
  for (const row of RACE_IDS) {
    const cells = RACE_IDS.map((col) => {
      if (row === col) return '-'.padEnd(10);
      const n = pairGames.get([row, col].sort().join('|')) ?? 0;
      const w = pairWins.get(`${row}>${col}`) ?? 0;
      return (n > 0 ? `${((w / n) * 100).toFixed(0)}%(${n})` : '-').padEnd(10);
    });
    console.log(row.padEnd(10), ...cells);
  }
}

main();
