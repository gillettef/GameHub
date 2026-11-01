// 준비 (Rules.md 5절)
import type { GameState, PlayerState, Ring } from '../types';
import { BUILDING_KINDS, UNIT_KINDS } from '../types';
import { createRng } from '../rng';
import { COLONIST_TOTAL, MAX_PLAYERS, MIN_PLAYERS, SAT_MARKET, SEAT_BONUS, START_RES } from '../data/constants';
import { CORE_ID } from '../data/techWeb';
import { FINALES, FRUITIONS, eraDeckIds } from '../data/quests';
import { PATRONS } from '../data/patrons';
import { SATELLITES } from '../data/satellites';
import { generateLayout } from './research';
import { refillRow } from './quest';
import { gain, log } from './util';
import { startTurn } from './turn';

export interface SeatConfig {
  name: string;
  isAI: boolean;
}

function newPlayer(id: number, seat: SeatConfig): PlayerState {
  const levels = () => [0, 0, 0, 0];
  const buildings = Object.fromEntries(BUILDING_KINDS.map((k) => [k, levels()])) as PlayerState['buildings'];
  const units = Object.fromEntries(UNIT_KINDS.map((k) => [k, levels()])) as PlayerState['units'];
  buildings.farm[0] = 2;
  buildings.workshop[0] = 2;
  buildings.lab[0] = 1;
  units.guard[0] = 1;
  const placed = 6;
  return {
    id,
    name: seat.name,
    isAI: seat.isAI,
    res: { ...START_RES },
    researched: [CORE_ID],
    buildings,
    units,
    idle: 1,
    pool: COLONIST_TOTAL - placed - 1,
    doctrine: { ark: 0, symbiont: 0, synth: 0 },
    pioneer: null,
    pioneerEras: [],
    legacyWip: null,
    legacies: [],
    hand: [],
    orbit: [],
    charters: { prosperity: 0, explore: 0, defense: 0, bond: 0 },
    patrons: [],
    facilities: [],
    commandUsed: 0,
    defenseUsed: 0,
    guard: 0,
    coexist: 0,
    conflict: null,
    harmedRound: 0,
  };
}

/** seed: 숫자 하나(로컬·테스트) 또는 32비트 단어 4개(서버, 역산 방지) */
export function createGame(seed: number | number[], seats: SeatConfig[]): GameState {
  if (seats.length < MIN_PLAYERS || seats.length > MAX_PLAYERS) throw new Error('인원은 2~4명');
  const rng = createRng(seed);
  // RNG 순서(테크 웹 배치는 고정이라 난수 없음): 시대별 퀘스트 덱(사건 + 후원자·유산·자원 팟) → 공통 종료 → 주둔지 → 위성 → 시작 플레이어
  const layout = generateLayout();
  const players = seats.map((s, i) => newPlayer(i, s));
  const questDecks: GameState['questDecks'] = { 1: [], 2: [], 3: [], 4: [] };
  for (const r of [1, 2, 3] as Ring[]) questDecks[r] = rng.shuffle(eraDeckIds(r));
  const finale = FINALES[rng.int(FINALES.length)];
  const endBundle = [...FRUITIONS.map((f) => f.id), finale.id];
  const patronDecks = {} as Record<Ring, string[]>;
  for (const r of [1, 2, 3] as Ring[]) patronDecks[r] = rng.shuffle(PATRONS.filter((p) => p.era === r).map((p) => p.id));
  const satDeck = rng.shuffle(SATELLITES.map((s) => s.id));
  const startPlayer = rng.int(players.length);

  players.forEach((p) => {
    const seat = (p.id - startPlayer + players.length) % players.length;
    gain(p.res, SEAT_BONUS[seat]);
  });

  const state: GameState = {
    version: 4,
    seed: Array.isArray(seed) ? 0 : seed,
    rngState: rng.state(),
    ver: 0,
    players,
    era: 1,
    round: 1,
    startPlayer,
    current: startPlayer,
    phase: 'quest',
    layout,
    questDecks,
    questRow: [],
    questOpen: [],
    questDiscard: [],
    turnFront: null,
    endBundle,
    patronDecks,
    satDeck,
    satMarket: satDeck.splice(0, SAT_MARKET),
    stage4Order: { ark: [], symbiont: [], synth: [] },
    pending: [],
    steps: [],
    eraStartRound: 1,
    endTriggered: false,
    gameOver: false,
    log: [],
  };
  refillRow(state);
  log(state, null, `게임 시작 — 시작 플레이어 ${players[startPlayer].name}`);
  startTurn(state);
  return state;
}
