// 준비 (Rules.md 5절)
import type { GameState, PlayerState, Ring } from '../types';
import { BUILDING_KINDS, UNIT_KINDS } from '../types';
import { createRng } from '../rng';
import { CARD_ROW_SIZE, COLONIST_TOTAL, MAX_PLAYERS, MIN_PLAYERS, SAT_MARKET, SEAT_BONUS, START_RES } from '../data/constants';
import { CORE_ID } from '../data/techWeb';
import { ringDeckIds } from '../data/cards';
import { FINALES, FRUITIONS, QUEST_DECKS } from '../data/quests';
import { PATRONS } from '../data/patrons';
import { SATELLITES } from '../data/satellites';
import { MISSIONS } from '../data/missions';
import { generateLayout } from './research';
import { fillSlots } from './quest';
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
    missions: [],
    missionsDone: [],
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

export function createGame(seed: number, seats: SeatConfig[]): GameState {
  if (seats.length < MIN_PLAYERS || seats.length > MAX_PLAYERS) throw new Error('인원은 2~4명');
  const rng = createRng(seed);
  // RNG 순서: 방향 순서 → 곁가지 → 임무 → 카드 덱 → 퀘스트 덱 → 공통 종료 → 후원 계약 → 위성 → 시작 플레이어
  const layout = generateLayout(rng);
  const players = seats.map((s, i) => newPlayer(i, s));
  const missionDeck = rng.shuffle(MISSIONS.map((m) => m.id));
  const missionHands = players.map(() => missionDeck.splice(0, 3));
  const cardDecks = { 1: rng.shuffle(ringDeckIds(1)), 2: rng.shuffle(ringDeckIds(2)), 3: rng.shuffle(ringDeckIds(3)) } as Record<Ring, string[]>;
  const questDecks = {} as Record<Ring, string[]>;
  for (const r of [1, 2, 3] as Ring[]) questDecks[r] = rng.shuffle(QUEST_DECKS[r].map((q) => q.id));
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
    version: 1,
    seed,
    rngState: rng.state(),
    players,
    era: 1,
    round: 1,
    startPlayer,
    current: startPlayer,
    phase: 'external',
    layout,
    cardDecks,
    cardRow: cardDecks[1].splice(0, CARD_ROW_SIZE),
    questDecks,
    questFuture: [],
    questSlots: [null, null],
    endBundle,
    patronDecks,
    satDeck,
    satMarket: satDeck.splice(0, SAT_MARKET),
    missionDeck,
    stage4Order: { ark: [], symbiont: [], synth: [] },
    pending: missionHands.map((options, i) => ({ kind: 'mission' as const, player: i, options })),
    steps: [],
    cardDiscard: { 1: [], 2: [], 3: [] },
    eraStartRound: 1,
    endTriggered: false,
    gameOver: false,
    log: [],
  };
  state.questFuture = state.questDecks[1].splice(0);
  fillSlots(state);
  log(state, null, `게임 시작 — 시작 플레이어 ${players[startPlayer].name}`);
  startTurn(state, true);
  return state;
}
