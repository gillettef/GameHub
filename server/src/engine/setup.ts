import { EXECUTIVE_CARDS, OBJECTIVE_CARDS, OPPONENT_CARDS, PLAYER_CARDS, SPONSOR_CARDS, STAFF_CARDS, TACTIC_CARDS, BOARD_CARDS } from '../data';
import { cards } from './cards';
import { addToRoster, applyEffects, moveTrack } from './effects';
import { startMonday } from './monday';
import { GameError, getPlayer, leftOf } from './state';
import type { GameState, PlayerId, PlayerState } from './state';
import type { Rng } from './rng';
import { DIVISION_TIERS } from './types';
import type { Division, DivisionTier } from './types';
import { balanceFieldFaces, createUniformTokens } from './uniforms';

export interface GameConfig {
  id: string;
  players: { id: PlayerId; name: string }[];
  division: Division;
  firstPlayer?: PlayerId; // p.4: 가장 최근에 골을 넣은 참가자
}

const MARKET_ROW = 5;
const DRAFT_HAND = 4;
const FIRST_TRAINER_JOB = '첫 번째 트레이너';

function draw(deck: string[], n: number): string[] {
  return deck.splice(0, n);
}

// 한 덱에서 팀이 서로 다른 3장 (p.8 c)
function drawOpponents(deck: string[], n: number): string[] {
  const picked: string[] = [];
  const teams = new Set<string>();
  for (let i = 0; i < deck.length && picked.length < n; i++) {
    const id = deck[i]!;
    const team = cards.opponent(id).teamId;
    if (teams.has(team)) continue;
    teams.add(team);
    picked.push(id);
  }
  if (picked.length < n) throw new GameError('opponent deck exhausted');
  for (const id of picked) deck.splice(deck.indexOf(id), 1);
  return picked;
}

function createPlayerState(id: PlayerId, name: string): PlayerState {
  return {
    id,
    name,
    resources: { money: 0, fandom: 0, ops: 0, stamina: 0 },
    tracks: { money: 2, fandom: 2, ops: 2, stamina: 2 }, // p.7 b
    executives: [],
    staff: [],
    roster: [],
    uniforms: createUniformTokens(),
    sponsors: { billboards: [] },
    infrastructure: [],
    office: 0,
    tacticCards: [],
    opponentDeck: [],
    scouted: false,
    restrictions: [],
    passives: [],
    upkeepDiscount: 0,
    tacticRedrawn: false,
    freeRerollUsed: { board: false, match: false },
    matchHistory: [],
    matchDieInjured: false,
    kitSponsors: 0,
    vp: 0,
    pending: [],
    nextInstance: 1,
  };
}

export function createGame(config: GameConfig, rng: Rng): GameState {
  const n = config.players.length;
  if (n < 1 || n > 4) throw new GameError('players must be 1~4');
  if (new Set(config.players.map((p) => p.id)).size !== n) throw new GameError('duplicate player id');

  const seats = config.players.map((p) => p.id);
  const firstPlayer = config.firstPlayer ?? seats[0]!;
  if (!seats.includes(firstPlayer)) throw new GameError('firstPlayer not in game');

  // p.4 이적 시장 준비
  const starters = rng.shuffle(PLAYER_CARDS.filter((c) => c.kind === 'starter').map((c) => c.id));
  const prospects = rng.shuffle(PLAYER_CARDS.filter((c) => c.kind === 'prospect').map((c) => c.id));
  const veterans = rng.shuffle(PLAYER_CARDS.filter((c) => c.kind === 'veteran').map((c) => c.id));
  const firstTrainers = rng.shuffle(STAFF_CARDS.filter((c) => c.job === FIRST_TRAINER_JOB).map((c) => c.id));
  const staff = rng.shuffle(STAFF_CARDS.filter((c) => c.job !== FIRST_TRAINER_JOB && c.minPlayers <= n).map((c) => c.id));
  const sponsors = rng.shuffle(SPONSOR_CARDS.map((c) => c.id));
  const board = rng.shuffle(BOARD_CARDS.map((c) => c.id));
  const objectives = rng.shuffle(OBJECTIVE_CARDS.map((c) => c.id));
  const basicTactics = rng.shuffle(TACTIC_CARDS.filter((c) => c.basic).map((c) => c.id));
  const executives = rng.shuffle(EXECUTIVE_CARDS.map((c) => c.id));
  const tiers = DIVISION_TIERS[config.division];
  const deckFor = (tier: DivisionTier) => rng.shuffle(OPPONENT_CARDS.filter((c) => c.tier === tier).map((c) => c.id));
  const easyDeck = deckFor(tiers.easy);
  const hardDeck = deckFor(tiers.hard);
  const leagueTeams = [...new Set([...easyDeck, ...hardDeck].map((id) => cards.opponent(id).teamId))];

  // p.7 c: 임원 4장씩
  const hands = Object.fromEntries(seats.map((id) => [id, draw(executives, DRAFT_HAND)]));
  const picked = Object.fromEntries(seats.map((id) => [id, null]));

  const state: GameState = {
    id: config.id,
    division: config.division,
    week: 1,
    phase: { kind: 'setup.draft', round: 1, hands, picked },
    seats,
    firstPlayer,
    players: {},
    market: { players: draw(starters, MARKET_ROW), veterans: [], staff: draw(staff, MARKET_ROW), sponsors: draw(sponsors, MARKET_ROW) },
    decks: {
      starters,
      prospects,
      veterans,
      staff,
      sponsors,
      board,
      tactics: [],
      objectives,
      discards: { players: [], veterans: [], prospects: [], staff: [], sponsors: [], board: [] },
    },
    league: { players: {}, opponents: leagueTeams.map((teamId) => ({ teamId, position: 0, active: true })) },
    log: [],
  };

  for (const { id, name } of config.players) {
    const player = createPlayerState(id, name);
    state.players[id] = player;
    state.league.players[id] = 0;

    // p.4 3: 첫 번째 트레이너 / p.8 c: 상대 팀 6장 (쉬운 3장이 위) / p.8 d: 베테랑 1 + 유망주 1 / p.9 b: 기본 전술 1
    player.staff.push({ cardId: firstTrainers.shift()!, exhausted: false, suspension: 0 });
    player.opponentDeck = [...drawOpponents(easyDeck, 3), ...drawOpponents(hardDeck, 3)];
    addToRoster(player, veterans.shift()!);
    addToRoster(player, prospects.shift()!);
    balanceFieldFaces(player.uniforms);
    player.tacticCards.push(basicTactics.shift()!);
  }

  // p.9 b: 남은 전술 카드(기본 포함)를 섞어 더미로
  state.decks.tactics = rng.shuffle([...basicTactics, ...TACTIC_CARDS.filter((c) => !c.basic).map((c) => c.id)]);
  // 베테랑 행(원작에 없음, 사용자 결정): 각자 1장씩 받은 뒤 남은 더미에서 5장을 연다
  state.market.veterans = draw(veterans, MARKET_ROW);
  return state;
}

// p.7 c: 1장 고르고 나머지를 왼쪽으로 넘김 × 3라운드
export function draftPick(state: GameState, pid: PlayerId, cardId: string): GameState {
  const next = structuredClone(state);
  const phase = next.phase;
  if (phase.kind !== 'setup.draft') throw new GameError('not in draft phase');
  const hand = phase.hands[pid];
  if (!hand) throw new GameError(`unknown player: ${pid}`);
  if (phase.picked[pid]) throw new GameError('already picked this round');
  if (!hand.includes(cardId)) throw new GameError('card not in hand');
  phase.picked[pid] = cardId;

  if (Object.values(phase.picked).some((c) => c === null)) return next;

  for (const id of next.seats) {
    getPlayer(next, id).executives.push({ cardId: phase.picked[id]!, exhausted: false });
  }
  if (phase.round === 3) {
    revealExecutives(next);
    return next;
  }
  const passed: Record<PlayerId, string[]> = {};
  for (const id of next.seats) {
    passed[leftOf(next, id)] = phase.hands[id]!.filter((c) => c !== phase.picked[id]);
  }
  next.phase = {
    kind: 'setup.draft',
    round: (phase.round + 1) as 2 | 3,
    hands: passed,
    picked: Object.fromEntries(next.seats.map((id) => [id, null])),
  };
  return next;
}

// p.7 c: 공개 후 능력치 조정과 보너스 적용, 이어서 목표 카드 2장 중 1장 선택 (p.9 a)
function revealExecutives(state: GameState): void {
  for (const id of state.seats) {
    const player = getPlayer(state, id);
    for (const exec of player.executives) {
      const card = cards.executive(exec.cardId);
      for (const [track, delta] of Object.entries(card.trackAdjust)) {
        moveTrack(player, track as keyof typeof card.trackAdjust, delta);
      }
      if (card.bonus) applyEffects(state, id, card.bonus, card.name);
    }
  }
  state.phase = {
    kind: 'setup.objective',
    options: Object.fromEntries(state.seats.map((id) => [id, draw(state.decks.objectives, 2)])),
    chosen: Object.fromEntries(state.seats.map((id) => [id, null])),
  };
}

export function chooseObjective(state: GameState, pid: PlayerId, cardId: string): GameState {
  const next = structuredClone(state);
  const phase = next.phase;
  if (phase.kind !== 'setup.objective') throw new GameError('not in objective phase');
  const options = phase.options[pid];
  if (!options) throw new GameError(`unknown player: ${pid}`);
  if (phase.chosen[pid]) throw new GameError('already chosen');
  if (!options.includes(cardId)) throw new GameError('card not offered');
  phase.chosen[pid] = cardId;
  getPlayer(next, pid).objective = cardId;

  if (Object.values(phase.chosen).every((c) => c !== null)) startMonday(next);
  return next;
}
