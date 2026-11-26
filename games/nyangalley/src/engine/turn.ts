/**
 * 로비 → 이번 판 식물 공개 → 라운드(일과 고르기 → 차례마다 고른 일과: 가져오기 → 심기 / 담 넘기 / 명당 부르기) → 종료
 * (Rules.md 4·5·6·9절, 2026-11-26 v7 「골목 일과」).
 * 순수 함수. `applyAction(state, action) => { state, error? }`. 입력 state 를 변이하지 않는다.
 */
import { BREAD_BONUS, CALL_BONUS, CHORE_EXTRA, GOAL_COUNT, HAND_MAX, MOVE_TIMES, START_HAND, MAX_PLAYERS, MIN_PLAYERS, rulesFor } from './data/constants.js';
import { CHORE_IDS, getChore, isChoreId } from './data/chores.js';
import { FLOWER_SPECIES, FOREST_SPECIES, GOALS, SPECIES_IDS, getGoal, getSpecies, isSpeciesId } from './data/species.js';
import type { Action, ChoreId, Direction, GameLogEntry, GameResultReason, GameState, GoalId, LogKind, Plant, PlayerId, PlayerKind, PlayerState, Position, RoundStage, SpeciesId } from './types.js';
import { buildBoard, cellLabel, cellLabels, isDirection, samePos } from './board.js';
import {
  callRoots,
  canMove,
  computeOwners,
  entranceRoots,
  legalCallCells,
  legalMoveSources,
  legalMoveTargets,
  legalPlantCells,
  legalSeedCells,
  moveRoots,
  moveStepError,
  plantRoots,
  supplyLeft,
} from './influence.js';
import { deckKeyFrom, shuffle, shuffleDeck } from './rng.js';
import { computeRanking, computeScores } from './scoring.js';

export interface ActionResult {
  state: GameState;
  /** 거부됐으면 사유. 거부 시 state 는 입력과 같다 */
  error?: string;
}

const reject = (state: GameState, error: string): ActionResult => ({ state, error });

// ---------------------------------------------------------------------------
// 로비
// ---------------------------------------------------------------------------

/**
 * deckSeed 는 카드 더미 셔플 전용이다(Rules.md 11절). 온라인에서는 서버가 rngSeed 와 독립인 암호학적 난수를 넣어야
 * 공개 보드·목표로 손패를 역산할 수 없다. 생략하면(핫시트·테스트) rngSeed 에서 만든다
 */
export function createInitialState(roomId: string, rngSeed: number, deckSeed: number | readonly number[] = (rngSeed ^ 0x9e3779b9) >>> 0): GameState {
  return {
    roomId,
    phase: 'lobby',
    board: null,
    goals: [],
    species: [],
    market: [],
    pile: [],
    roundStart: 0,
    choreOffer: [],
    chores: [],
    peek: null,
    stage: 'chore',
    round: 0,
    turn: 0,
    currentPlayerId: null,
    players: [],
    plants: [],
    rootSeat: [],
    rootCount: [],
    rngSeed: rngSeed >>> 0,
    deckSeed: deckKeyFrom(deckSeed),
    result: null,
    log: [],
  };
}

export function createPlayer(id: PlayerId, nickname: string, kind: PlayerKind = 'human'): PlayerState {
  return { id, nickname, kind, seat: 0, isReady: kind === 'ai', hand: [], surrenderedOrder: null };
}

export function joinPlayer(state: GameState, player: PlayerState): ActionResult {
  if (state.phase !== 'lobby') return reject(state, '이미 시작된 게임입니다');
  if (state.players.length >= MAX_PLAYERS) return reject(state, `방에는 최대 ${MAX_PLAYERS}명까지 들어올 수 있습니다`);
  if (state.players.some((p) => p.id === player.id)) return reject(state, '이미 입장한 플레이어입니다');
  const joined = { ...player, seat: state.players.length };
  // 인원이 바뀌면 사람의 준비를 푼다: 준비해 둔 방장이 AI 를 하나 넣자마자 2인 판이 시작되거나,
  // "전원 준비"인데 시작되지 않는 상태가 생기지 않게 한다(AI 는 늘 준비 상태)
  let s: GameState = { ...state, players: [...resetHumanReady(state.players), joined] };
  s = addLog(s, 'system', joined.id, `${joined.nickname} 입장`);
  return { state: s };
}

export function leaveLobby(state: GameState, playerId: PlayerId): ActionResult {
  if (state.phase !== 'lobby') return reject(state, '게임 중에는 나갈 수 없습니다. 기권하세요');
  const leaving = state.players.find((p) => p.id === playerId);
  if (!leaving) return reject(state, '방에 없는 플레이어입니다');
  const players = resetHumanReady(state.players.filter((p) => p.id !== playerId)).map((p, seat) => ({ ...p, seat }));
  return { state: addLog({ ...state, players }, 'system', null, `${leaving.nickname} 퇴장`) };
}

const resetHumanReady = (players: PlayerState[]): PlayerState[] => players.map((p) => (p.kind === 'human' ? { ...p, isReady: false } : p));

// ---------------------------------------------------------------------------
// 공용 도우미
// ---------------------------------------------------------------------------

export function addLog(state: GameState, kind: LogKind, playerId: PlayerId | null, message: string): GameState {
  const entry: GameLogEntry = { turn: state.turn, round: state.round, playerId, kind, message };
  return { ...state, log: [...state.log, entry] };
}

export function nameOf(state: Pick<GameState, 'players'>, playerId: PlayerId): string {
  return state.players.find((p) => p.id === playerId)?.nickname ?? playerId;
}

export function getPlayer(state: GameState, playerId: PlayerId): PlayerState | undefined {
  return state.players.find((p) => p.id === playerId);
}

function updatePlayer(state: GameState, playerId: PlayerId, patch: Partial<PlayerState>): GameState {
  return { ...state, players: state.players.map((p) => (p.id === playerId ? { ...p, ...patch } : p)) };
}

// ---------------------------------------------------------------------------
// 시작: 보드 → 목표 → 이번 판 식물 → 카드 더미·손 → 첫 마켓 (Rules.md 4·5절, 11절 난수 순서)
// ---------------------------------------------------------------------------

/** 16장을 섞고 앞에서부터 3장씩 끊어 조건(종 연계 1장 이상)을 만족하는 첫 묶음 */
export function pickGoals(seed: number): { goals: GoalId[]; seed: number } {
  let s = seed;
  for (;;) {
    const r = shuffle(GOALS.map((g) => g.id), s);
    s = r.seed;
    for (let i = 0; i + GOAL_COUNT <= r.items.length; i += GOAL_COUNT) {
      const chunk = r.items.slice(i, i + GOAL_COUNT);
      if (!chunk.some((g) => getGoal(g).species !== null)) continue;
      return { goals: chunk, seed: s };
    }
  }
}

/**
 * 이번 판 식물 (Rules.md 4절). 보호구역 목표의 식물은 반드시, 꽃밭·숲 목표가 있으면 꽃·나무 중 하나 이상(표 순서를 섞어 첫 번째),
 * 나머지는 남은 식물을 표 순서로 놓고 섞어 앞에서부터 채운다. 결과는 표 순서
 */
export function pickGarden(players: number, goals: GoalId[], seed: number): { species: SpeciesId[]; seed: number } {
  const size = rulesFor(players).gardenSize;
  const chosen = new Set<SpeciesId>();
  for (const g of goals) {
    const sp = getGoal(g).species;
    if (sp) chosen.add(sp);
  }
  let s = seed;
  const needOne = (pool: readonly SpeciesId[]) => {
    if (pool.some((x) => chosen.has(x))) return;
    const r = shuffle(SPECIES_IDS.filter((x) => pool.includes(x)), s);
    s = r.seed;
    chosen.add(r.items[0] as SpeciesId);
  };
  if (goals.includes('flower-bed')) needOne(FLOWER_SPECIES);
  if (goals.includes('forest')) needOne(FOREST_SPECIES);
  const rest = shuffle(SPECIES_IDS.filter((x) => !chosen.has(x)), s);
  s = rest.seed;
  for (const x of rest.items) {
    if (chosen.size >= size) break;
    chosen.add(x);
  }
  return { species: SPECIES_IDS.filter((x) => chosen.has(x)), seed: s };
}

/** 로비에서 2명 이상이 모두 준비했으면 시작한다. 아니면 그대로 */
export function maybeStart(state: GameState): GameState {
  if (state.phase !== 'lobby' || state.players.length < MIN_PLAYERS || !state.players.every((p) => p.isReady)) return state;
  return startGame(state);
}

/**
 * 보드·목표·이번 판 식물·카드 더미를 정하고 자리 0부터 1장씩 나눈 뒤 **이번 판 식물 공개 단계**로 간다 (Rules.md 4절).
 * 공개 단계의 isReady 는 "확인함"이다. AI 는 바로 확인한다
 */
export function startGame(state: GameState): GameState {
  const P = state.players.length;
  const rule = rulesFor(P);
  const built = buildBoard(P, state.rngSeed);
  const goals = pickGoals(built.seed);
  const garden = pickGarden(P, goals.goals, goals.seed);
  // 카드 더미: 이번 판 식물마다 copies 장을 섞고, 자리 0부터 손에 1장씩
  const dealt = shuffleDeck(garden.species.flatMap((sp) => new Array<SpeciesId>(rule.copies).fill(sp)), deckKeyFrom(state.deckSeed));
  const pile = [...dealt.items];
  const players = bySeat(state).map((p) => ({ ...p, hand: pile.splice(0, START_HAND), surrenderedOrder: null, isReady: p.kind === 'ai' }));
  const market = pile.splice(0, rule.market);
  const n = built.board.cells.length;
  let s: GameState = {
    ...state,
    phase: 'reveal',
    board: built.board,
    goals: goals.goals,
    species: garden.species,
    rngSeed: garden.seed,
    deckSeed: dealt.key,
    market,
    pile,
    round: 0,
    stage: 'chore',
    roundStart: 0,
    choreOffer: [],
    chores: players.map(() => null),
    peek: null,
    turn: 0,
    currentPlayerId: null,
    plants: [],
    rootSeat: new Array<number>(n).fill(-1),
    rootCount: new Array<number>(n).fill(0),
    result: null,
    players,
  };
  s = { ...s, ...entranceRoots(s) };
  s = addLog(s, 'system', null, `게임 시작: 소문 ${goals.goals.map((g) => getGoal(g).name).join(' · ')} / 명당 ${garden.species.map((x) => getSpecies(x).name).join(' · ')}`);
  s = addLog(s, 'system', null, `아지트: ${players.map((p) => `${p.seat + 1}번 자리 ${cellLabel(built.board, built.board.entrances[p.seat] as Position)}`).join(' · ')}`);
  return maybeBeginPlay(s);
}

/** 공개 단계에서 기권하지 않은 사람이 모두 확인했으면 1라운드를 연다 (Rules.md 4절 7) */
function maybeBeginPlay(state: GameState): GameState {
  if (state.phase !== 'reveal') return state;
  if (!state.players.filter(isActive).every((p) => p.isReady)) return state;
  const first = bySeat(state).find(isActive) as PlayerState;
  return beginRound({ ...state, phase: 'playing' }, 1, first.seat);
}


// ---------------------------------------------------------------------------
// 진행 (Rules.md 5절, v7 「골목 일과」)
// ---------------------------------------------------------------------------

const isActive = (p: PlayerState) => p.surrenderedOrder === null;
/** 자리 순서로 정렬한 플레이어 */
const bySeat = (state: GameState): PlayerState[] => [...state.players].sort((a, b) => a.seat - b.seat);
const seatOfId = (state: GameState, playerId: PlayerId | null): number => (playerId ? (getPlayer(state, playerId)?.seat ?? -1) : -1);

/** 손패의 어떤 카드라도 심을 칸이 있는가 (마실을 골랐으면 마실 칸 포함) */
export function hasAnyPlant(state: GameState, playerId: PlayerId): boolean {
  const me = getPlayer(state, playerId);
  if (!me || !state.board) return false;
  return [...new Set(me.hand)].some((s) => legalPlantCells(state, playerId, s).length > 0);
}

/** 이번 라운드에 펼친 일과 중 아직 아무도 고르지 않은 것 (펼친 순서) */
export function remainingChores(state: Pick<GameState, 'choreOffer' | 'chores'>): ChoreId[] {
  return state.choreOffer.filter((c) => !state.chores.includes(c));
}

/** 이번 라운드에 대장 방울을 고른 기권 안 한 자리 (없으면 null). 이 사람이 다음 라운드 선이다 (Rules.md 5.4) */
export function bossSeat(state: Pick<GameState, 'players' | 'chores'>): number | null {
  const seat = state.chores.indexOf('boss');
  if (seat < 0) return null;
  const p = state.players.find((x) => x.seat === seat);
  return p && isActive(p) ? seat : null;
}

/** 지금 차례인 사람이 고른 일과 (없으면 null) */
export function currentChore(state: Pick<GameState, 'players' | 'chores' | 'currentPlayerId'>): ChoreId | null {
  const p = state.players.find((x) => x.id === state.currentPlayerId);
  return p ? (state.chores[p.seat] ?? null) : null;
}

function finishGame(state: GameState, reason: GameResultReason): GameState {
  const scores = computeScores(state);
  const ranking = computeRanking(state, scores);
  const winner = ranking[0] ?? null;
  let s: GameState = { ...state, phase: 'finished', currentPlayerId: null, market: [], peek: null, result: { reason, ranking, scores } };
  const summary = ranking.map((id, i) => `${i + 1}위 ${nameOf(s, id)} ${scores[id]?.total ?? 0}점`).join(', ');
  s = addLog(s, 'result', winner, `게임 종료${reason === 'last-standing' ? ' (남은 사람 1명)' : ''}: ${summary}`);
  return s;
}

/**
 * 다음 라운드의 선 (Rules.md 5.4): 대장 방울을 고른 사람(기권 안 함)이 있으면 그 사람. 없으면 공급처에 큐브가 가장 많이 남은
 * 기권 안 한 사람. 동점이면 이번 선의 다음 자리부터 시계방향으로 처음 만나는 동점자(이번 선은 마지막 후보)
 */
export function nextRoundStart(state: GameState): number {
  const boss = bossSeat(state);
  if (boss !== null) return boss;
  const P = state.players.length;
  const seats = bySeat(state);
  const left = supplyLeft(state);
  const active = seats.filter(isActive);
  if (active.length === 0) return state.roundStart;
  const most = Math.max(...active.map((p) => left[p.seat] ?? 0));
  for (let k = 1; k <= P; k++) {
    const p = seats[(state.roundStart + k) % P] as PlayerState;
    if (isActive(p) && (left[p.seat] ?? 0) === most) return p.seat;
  }
  return state.roundStart;
}

/** 이번 라운드에서 after 자리 뒤(선 기준 순서)로 ok 를 만족하는 첫 사람. after 가 null 이면 선부터 */
function nextInRound(state: GameState, after: number | null, ok: (p: PlayerState) => boolean): PlayerState | null {
  const P = state.players.length;
  const seats = bySeat(state);
  const start = state.roundStart;
  const from = after === null ? 0 : ((after - start + P) % P) + 1;
  for (let k = from; k < P; k++) {
    const p = seats[(start + k) % P] as PlayerState;
    if (ok(p)) return p;
  }
  return null;
}

/**
 * 라운드를 연다 (Rules.md 5.1): 보드 시드 RNG 로 일과 6장을 섞어 (기권 안 한 인원 + 1)장을 펼치고, 선부터 일과 고르기
 */
function beginRound(state: GameState, round: number, start: number): GameState {
  const active = state.players.filter(isActive).length;
  const shuffled = shuffle([...CHORE_IDS], state.rngSeed);
  const choreOffer = shuffled.items.slice(0, active + CHORE_EXTRA);
  let s: GameState = { ...state, round, roundStart: start, rngSeed: shuffled.seed, choreOffer, chores: state.players.map(() => null), peek: null };
  const lead = s.players.find((p) => p.seat === start) as PlayerState;
  s = addLog(s, 'system', lead.id, `${round}라운드: ${lead.nickname} 선 · 펼친 일과 ${choreOffer.map((c) => getChore(c).name).join(' · ')}`);
  const first = nextInRound(s, null, isActive);
  return first ? enterPick(s, first) : finishGame(s, 'complete');
}

/** 일과 고르기 차례를 연다 */
function enterPick(state: GameState, next: PlayerState): GameState {
  return { ...state, stage: 'chore', currentPlayerId: next.id, turn: state.turn + 1 };
}

/** 일과를 고른 뒤: 아직 안 고른 다음 사람, 모두 골랐으면 선부터 차례 (Rules.md 5.1 3) */
function afterPick(state: GameState, curSeat: number | null): GameState {
  const active = state.players.filter(isActive);
  if (active.length <= 1 && state.players.length > 1) return finishGame(state, 'last-standing');
  const next = nextInRound(state, curSeat, (p) => isActive(p) && state.chores[p.seat] === null);
  if (next) return enterPick(state, next);
  const first = nextInRound(state, null, isActive);
  return first ? enterTurn(state, first) : endRound(state);
}

/** 이 사람이 고른 일과로 이번 차례에 들어갈 단계. 할 수 있는 일이 없으면 null (Rules.md 5.2) */
function turnStage(state: GameState, p: PlayerState): RoundStage | null {
  const chore = state.chores[p.seat] ?? null;
  if (!chore) return null;
  if (chore === 'move') return canMove(state, p.id) ? 'move' : null;
  if (chore === 'call') return legalCallCells(state, p.id).length > 0 ? 'call' : null;
  if (state.market.length > 0) return 'take';
  return p.hand.length > 0 ? 'plant' : null;
}

/**
 * 차례를 연다. 고른 일과대로 가져오기·담 넘기·명당 부르기 단계로 가고, 할 수 있는 일이 없으면 기록만 남기고 다음 사람으로 넘어간다.
 * 생선 냄새 차례의 가져오기는 카드 더미 맨 위 1장을 앞면으로 편 뒤 시작한다 (Rules.md 5.3)
 */
function enterTurn(state: GameState, next: PlayerState): GameState {
  let s = state;
  let p: PlayerState | null = next;
  while (p) {
    s = { ...s, currentPlayerId: p.id, turn: s.turn + 1 };
    const chore = s.chores[p.seat] ?? null;
    s = addLog(s, 'turn', p.id, `${p.nickname}의 차례${chore ? ` · ${getChore(chore).name}` : ''}`);
    const stage = turnStage(s, p);
    if (stage) {
      s = { ...s, stage };
      if (stage === 'take' && chore === 'peek' && s.pile.length > 0) {
        const pile = [...s.pile];
        const card = pile.shift() as SpeciesId;
        s = addLog({ ...s, pile, peek: card }, 'peek', p.id, `${p.nickname}: 생선 냄새로 주머니 맨 위 ${getSpecies(card).name}을(를) 펼침`);
      }
      return s;
    }
    s = addLog(s, 'pass', p.id, `${p.nickname}: 할 수 있는 일이 없어 이번 차례를 쉼`);
    p = nextInRound(s, p.seat, isActive);
  }
  return endRound(s);
}

/** 라운드 끝 (Rules.md 5.4·9절): 라운드 수를 채웠거나 더미·마켓·손이 모두 비면 종료, 아니면 다음 선으로 다음 라운드 */
function endRound(state: GameState): GameState {
  const rounds = rulesFor(state.players.length).rounds;
  const empty = state.pile.length === 0 && state.market.length === 0 && state.players.filter(isActive).every((p) => p.hand.length === 0);
  if (state.round >= rounds || empty) return finishGame(state, 'complete');
  return beginRound(state, state.round + 1, nextRoundStart(state));
}

/** 지금 사람의 차례가 끝났다: 이번 라운드의 다음 사람, 없으면 다음 라운드로 */
function advance(state: GameState): GameState {
  const active = state.players.filter(isActive);
  if (active.length <= 1 && state.players.length > 1) return finishGame(state, 'last-standing');
  const curSeat = getPlayer(state, state.currentPlayerId as PlayerId)?.seat ?? state.roundStart;
  const next = nextInRound(state, curSeat, isActive);
  return next ? enterTurn(state, next) : endRound(state);
}

/** 손에서 카드 한 장을 뺀다 */
function spendCard(state: GameState, playerId: PlayerId, species: SpeciesId): GameState {
  const me = getPlayer(state, playerId) as PlayerState;
  const hand = [...me.hand];
  hand.splice(hand.indexOf(species), 1);
  return updatePlayer(state, playerId, { hand });
}

const STAGE_HINT: Record<RoundStage, string> = {
  chore: '먼저 펼친 일과 중 하나를 고르세요',
  take: '먼저 펼친 타일이나 주머니에서 타일을 가져오세요',
  plant: '이미 가져왔습니다. 손의 타일 중 하나를 놓으세요',
  move: '담 넘기 차례입니다. 고양이를 옮기세요',
  call: '명당 부르기 차례입니다. 내 칸 위 명당을 고르세요',
};

/** 지금 이 사람이 이 단계의 차례인가. 아니면 거부 사유 */
function turnError(state: GameState, playerId: PlayerId, stage: RoundStage): string | null {
  if (state.phase !== 'playing') return '진행 중인 게임이 아닙니다';
  if (state.currentPlayerId !== playerId) return '내 차례가 아닙니다';
  if (state.stage !== stage) return STAGE_HINT[state.stage];
  return null;
}

/** 일과 고르기 검사 (Rules.md 5.1) */
export function validatePickChore(state: GameState, a: { playerId: PlayerId; chore: unknown }): string | null {
  const err = turnError(state, a.playerId, 'chore');
  if (err) return err;
  if (!isChoreId(a.chore) || !state.choreOffer.includes(a.chore)) return '이번 라운드에 펼친 일과가 아닙니다';
  if (state.chores.includes(a.chore)) return '이미 누가 고른 일과입니다';
  return null;
}

function applyPickChore(state: GameState, action: Extract<Action, { type: 'PICK_CHORE' }>): ActionResult {
  const err = validatePickChore(state, action);
  if (err) return reject(state, err);
  const me = getPlayer(state, action.playerId) as PlayerState;
  const chores = state.chores.map((c, seat) => (seat === me.seat ? action.chore : c));
  const s = addLog({ ...state, chores }, 'chore', me.id, `${me.nickname}: 일과 「${getChore(action.chore).name}」 고름`);
  return { state: afterPick(s, me.seat) };
}

/** 가져오기 검사 (Rules.md 5.2 1·5.3). take: 마켓 번호, 'pile' = 카드 더미 맨 위 1장(뒷면), 'peek' = 생선 냄새로 편 카드 */
export function validateTake(state: GameState, a: { playerId: PlayerId; take: unknown }): string | null {
  const err = turnError(state, a.playerId, 'take');
  if (err) return err;
  const peekTurn = state.chores[seatOfId(state, a.playerId)] === 'peek';
  if (a.take === 'peek') return state.peek !== null ? null : '펼쳐 둔 생선 냄새 타일이 없습니다';
  if (a.take === 'pile') {
    if (peekTurn) return '생선 냄새 차례에는 주머니 대신 펼친 타일 3개 중에서 가져옵니다';
    return state.pile.length > 0 ? null : '주머니가 비었습니다. 펼친 타일에서 가져오세요';
  }
  if (!Number.isInteger(a.take) || (a.take as number) < 0 || (a.take as number) >= state.market.length) return '없는 타일입니다';
  return null;
}

const isPos = (p: unknown): p is Position => {
  const v = p as Record<string, unknown> | null;
  return !!v && typeof v === 'object' && Number.isInteger(v.q) && Number.isInteger(v.r);
};

export function validatePlant(state: GameState, a: Extract<Action, { type: 'PLANT' }>): string | null {
  if (!isPos(a.pos) || (a.seed !== undefined && !isPos(a.seed))) return '잘못된 놓기 요청입니다';
  if (a.rotation !== undefined && !isDirection(a.rotation)) return '잘못된 회전입니다';
  const err = turnError(state, a.playerId, 'plant');
  if (err) return err;
  const me = getPlayer(state, a.playerId);
  if (!me) return '없는 플레이어입니다';
  if (!isSpeciesId(a.species) || !me.hand.includes(a.species)) return '손에 없는 타일입니다';
  const sp = getSpecies(a.species);
  if (!legalPlantCells(state, a.playerId, a.species).some((p) => samePos(p, a.pos))) {
    if (state.chores[me.seat] === 'roam') return '내 칸, 내 칸·아지트와 맞닿은 빈 칸, 내 칸에서 두 칸 안의 빈 골목길에만 놓을 수 있습니다';
    return sp.pondPlanting ? '내 칸, 내 칸·아지트와 맞닿은 빈 칸, 개울 옆 빈 칸에만 놓을 수 있습니다' : '내 칸이나 내 칸·아지트와 맞닿은 빈 칸에만 놓을 수 있습니다';
  }
  if (a.seed !== undefined) {
    if (!sp.seed) return '이 명당은 멀리 보낼 고양이가 없습니다';
    if (!legalSeedCells(state, a.pos).some((p) => samePos(p, a.seed as Position))) return '멀리 보내는 고양이는 놓은 칸에서 두 칸 안, 고양이가 앉을 수 있는 칸에만 보낼 수 있습니다';
  }
  return null;
}

/**
 * 가져오기 (Rules.md 5.2 1·5.3): 마켓 한 장(빈자리는 더미 맨 위로 바로 채움), 카드 더미 맨 위 1장(뒷면), 생선 냄새로 편 카드.
 * 생선 냄새: 가져온 뒤 마켓이 3장이면 남은 편 카드를 더미 맨 위로 되돌린다. 3장이 안 되면(더미가 비어 채우지 못함) 편 카드가 마켓에 남는다
 */
function applyTake(state: GameState, action: Extract<Action, { type: 'TAKE' }>): ActionResult {
  const err = validateTake(state, action);
  if (err) return reject(state, err);
  const me = getPlayer(state, action.playerId) as PlayerState;
  const pile = [...state.pile];
  if (action.take === 'pile') {
    // 카드 더미 맨 위 1장: 본인만 본다. 기록에 식물 이름을 남기지 않는다 (Rules.md 5절)
    const card = pile.shift() as SpeciesId;
    const s = updatePlayer({ ...state, pile, stage: 'plant' }, action.playerId, { hand: [...me.hand, card] });
    return { state: addLog(s, 'take', action.playerId, `${me.nickname}: 주머니에서 1개 뽑음`) };
  }
  if (action.take === 'peek') {
    const card = state.peek as SpeciesId;
    const s = updatePlayer({ ...state, peek: null, stage: 'plant' }, action.playerId, { hand: [...me.hand, card] });
    return { state: addLog(s, 'take', action.playerId, `${me.nickname}: 생선 냄새로 편 ${getSpecies(card).name} 가져옴`) };
  }
  const card = state.market[action.take] as SpeciesId;
  const market = state.market.filter((_, i) => i !== action.take);
  if (pile.length) market.push(pile.shift() as SpeciesId);
  let s = updatePlayer({ ...state, market, pile, stage: 'plant' }, action.playerId, { hand: [...me.hand, card] });
  s = addLog(s, 'take', action.playerId, `${me.nickname}: 펼친 타일에서 ${getSpecies(card).name} 가져옴`);
  if (state.peek !== null) {
    const peek = state.peek;
    if (market.length >= rulesFor(state.players.length).market) {
      s = addLog({ ...s, peek: null, pile: [peek, ...pile] }, 'peek', action.playerId, `${me.nickname}: 펼쳤던 ${getSpecies(peek).name}을(를) 주머니 맨 위로 되돌림`);
    } else {
      s = { ...s, peek: null, market: [...market, peek] };
    }
  }
  return { state: s };
}

/** 심기 (Rules.md 6절·5.3): 식물을 놓고 뿌리를 뻗은 뒤(식빵 굽기면 심은 칸 +1) 손에서 카드를 빼고 차례를 넘긴다 */
function applyPlant(state: GameState, action: Extract<Action, { type: 'PLANT' }>): ActionResult {
  const err = validatePlant(state, action);
  if (err) return reject(state, err);
  const sp = getSpecies(action.species);
  const rotation = (action.rotation ?? 0) as Direction;
  const seed = action.seed && sp.seed ? { q: action.seed.q, r: action.seed.r } : null;
  const plant = { id: `p${state.plants.length + 1}`, species: action.species, ownerId: action.playerId, pos: { q: action.pos.q, r: action.pos.r }, rotation };
  const bonus = state.chores[seatOfId(state, action.playerId)] === 'bread' ? BREAD_BONUS : 0;
  let s: GameState = { ...state, plants: [...state.plants, plant] };
  const res = plantRoots(s, action.playerId, action.species, action.pos, rotation, seed, bonus);
  s = spendCard({ ...s, rootSeat: res.rootSeat, rootCount: res.rootCount }, action.playerId, action.species);
  const me = getPlayer(state, action.playerId) as PlayerState;
  const board = state.board as NonNullable<GameState['board']>;
  s = addLog(s, 'plant', action.playerId, `${me.nickname}: ${cellLabel(board, action.pos)}에 ${sp.name} 놓음${seed ? `, 멀리 ${cellLabel(board, seed)}` : ''}${bonus ? `, 식빵 굽기 +${bonus}` : ''}`);
  s = logRootChanges(state, s, me, res.uprooted);
  return { state: advance(s) };
}

/** 큐브 변화 기록: 옮겨 온 뿌리 → 빼앗은 칸 순서. 칸 이름은 Rules.md 2절 "칸 이름" (예: C4) */
function logRootChanges(before: GameState, after: GameState, me: PlayerState, uprooted: number[]): GameState {
  const board = before.board as NonNullable<GameState['board']>;
  const labels = cellLabels(board);
  let s = after;
  if (uprooted.length) {
    const from = [...new Set(uprooted)].map((c) => labels[c]).join(', ');
    s = addLog(s, 'uproot', me.id, `${me.nickname}: 쉬는 고양이가 모자라 내 칸 ${from}에서 고양이 ${uprooted.length}마리를 데려옴`);
  }
  // 다른 사람 땅이 줄었으면 밀어낸 것으로 기록한다 (진행 탭·연출용)
  const was = computeOwners(before);
  const now = computeOwners(after);
  for (const p of after.players) {
    if (p.seat === me.seat) continue;
    const lost = labels.filter((_, c) => was[c] === p.seat && now[c] !== p.seat);
    if (lost.length) s = addLog(s, 'flip', me.id, `${me.nickname}: ${p.nickname}의 칸 ${lost.length}개를 빼앗음 (${lost.join(', ')})`);
  }
  return s;
}

/** 담 넘기 검사 (Rules.md 5.3): 1~2번, 각 이동은 그 앞 이동을 적용한 보드 기준 */
export function validateMove(state: GameState, a: { playerId: PlayerId; moves: unknown }): string | null {
  const err = turnError(state, a.playerId, 'move');
  if (err) return err;
  if (!Array.isArray(a.moves) || a.moves.length < 1 || a.moves.length > MOVE_TIMES) return `고양이를 1~${MOVE_TIMES}번 옮기세요`;
  let s: GameState = state;
  for (const m of a.moves as unknown[]) {
    const v = m as Record<string, unknown> | null;
    if (!v || typeof v !== 'object' || !isPos(v.from) || !isPos(v.to)) return '잘못된 담 넘기 요청입니다';
    const e = moveStepError(s, a.playerId, v.from, v.to, v.count as number);
    if (e) return e;
    s = { ...s, ...moveRoots(s, a.playerId, v.from, v.to, v.count as number) };
  }
  return null;
}

function applyMove(state: GameState, action: Extract<Action, { type: 'MOVE' }>): ActionResult {
  const err = validateMove(state, action);
  if (err) return reject(state, err);
  const me = getPlayer(state, action.playerId) as PlayerState;
  const board = state.board as NonNullable<GameState['board']>;
  let s: GameState = state;
  for (const m of action.moves) {
    s = { ...s, ...moveRoots(s, action.playerId, m.from, m.to, m.count) };
    s = addLog(s, 'move', me.id, `${me.nickname}: ${cellLabel(board, m.from)}의 고양이 ${m.count}마리가 ${cellLabel(board, m.to)}(으)로 담을 넘음`);
  }
  s = logRootChanges(state, s, me, []);
  return { state: advance(s) };
}

/** 명당 부르기에서 마켓 카드를 가져올 수 있는가 (손 HAND_MAX 장 미만, 마켓에 카드) (Rules.md 5.3) */
export function canCallTake(state: GameState, playerId: PlayerId): boolean {
  const me = getPlayer(state, playerId);
  return !!me && me.hand.length < HAND_MAX && state.market.length > 0;
}

/** 명당 부르기 검사 (Rules.md 5.3) */
export function validateCall(state: GameState, a: Extract<Action, { type: 'CALL' }>): string | null {
  if (!isPos(a.pos)) return '잘못된 명당 부르기 요청입니다';
  if (a.rotation !== undefined && !isDirection(a.rotation)) return '잘못된 회전입니다';
  const err = turnError(state, a.playerId, 'call');
  if (err) return err;
  if (!legalCallCells(state, a.playerId).some((p) => samePos(p, a.pos))) return '내 칸 위에 있는 명당만 부를 수 있습니다';
  if (canCallTake(state, a.playerId)) {
    if (!Number.isInteger(a.take) || (a.take as number) < 0 || (a.take as number) >= state.market.length) return '부른 뒤 가져올 펼친 타일을 고르세요';
  } else if (a.take !== undefined) return '손이 가득 찼거나 펼친 타일이 없어 가져올 수 없습니다';
  return null;
}

function applyCall(state: GameState, action: Extract<Action, { type: 'CALL' }>): ActionResult {
  const err = validateCall(state, action);
  if (err) return reject(state, err);
  const me = getPlayer(state, action.playerId) as PlayerState;
  const board = state.board as NonNullable<GameState['board']>;
  const pi = state.plants.findIndex((p) => samePos(p.pos, action.pos));
  const old = state.plants[pi] as Plant;
  const rotation = (action.rotation ?? old.rotation) as Direction;
  const plants = state.plants.map((p, i) => (i === pi ? { ...p, rotation } : p));
  let s: GameState = { ...state, plants };
  const res = callRoots(s, action.playerId, action.pos, rotation);
  s = { ...s, rootSeat: res.rootSeat, rootCount: res.rootCount };
  s = addLog(s, 'call', me.id, `${me.nickname}: ${cellLabel(board, action.pos)}의 ${getSpecies(old.species).name} 명당을 부름${rotation !== old.rotation ? ' (방향을 바꿈)' : ''}, 그 칸 +${CALL_BONUS}`);
  s = logRootChanges(state, s, me, res.uprooted);
  if (action.take !== undefined) {
    const pile = [...s.pile];
    const card = s.market[action.take] as SpeciesId;
    const market = s.market.filter((_, i) => i !== action.take);
    if (pile.length) market.push(pile.shift() as SpeciesId);
    s = updatePlayer({ ...s, market, pile }, me.id, { hand: [...me.hand, card] });
    s = addLog(s, 'take', me.id, `${me.nickname}: 펼친 타일에서 ${getSpecies(card).name} 가져옴`);
  }
  return { state: advance(s) };
}

export function applyAction(state: GameState, action: Action): ActionResult {
  switch (action.type) {
    case 'READY': {
      if (state.phase !== 'lobby') return reject(state, '이미 시작된 게임입니다');
      const me = getPlayer(state, action.playerId);
      if (!me) return reject(state, '없는 플레이어입니다');
      return { state: maybeStart(updatePlayer(state, action.playerId, { isReady: !me.isReady })) };
    }
    case 'CONFIRM': {
      if (state.phase !== 'reveal') return reject(state, '이번 판 명당 공개 단계가 아닙니다');
      const me = getPlayer(state, action.playerId);
      if (!me) return reject(state, '없는 플레이어입니다');
      if (!isActive(me)) return reject(state, '기권한 플레이어는 확인할 수 없습니다');
      if (me.isReady) return reject(state, '이미 확인했습니다');
      const s = addLog(updatePlayer(state, action.playerId, { isReady: true }), 'system', me.id, `${me.nickname} 확인`);
      return { state: maybeBeginPlay(s) };
    }
    case 'PICK_CHORE':
      return applyPickChore(state, action);
    case 'TAKE':
      return applyTake(state, action);
    case 'PLANT':
      return applyPlant(state, action);
    case 'DISCARD': {
      const err = turnError(state, action.playerId, 'plant');
      if (err) return reject(state, err);
      const me = getPlayer(state, action.playerId);
      if (!me || !me.hand.includes(action.species)) return reject(state, '손에 없는 타일입니다');
      if (hasAnyPlant(state, action.playerId)) return reject(state, '놓을 수 있는 칸이 있으면 버릴 수 없습니다');
      let s = spendCard(state, action.playerId, action.species);
      s = addLog(s, 'discard', action.playerId, `${me.nickname}: 놓을 곳이 없어 ${getSpecies(action.species).name} 버림`);
      return { state: advance(s) };
    }
    case 'MOVE':
      return applyMove(state, action);
    case 'CALL':
      return applyCall(state, action);
    case 'SURRENDER': {
      if (state.phase !== 'playing' && state.phase !== 'reveal') return reject(state, '게임 중에만 기권할 수 있습니다');
      const me = getPlayer(state, action.playerId);
      if (!me || me.surrenderedOrder !== null) return reject(state, '기권할 수 없습니다');
      const order = state.players.filter((p) => p.surrenderedOrder !== null).length;
      let s = updatePlayer(state, action.playerId, { surrenderedOrder: order, hand: [] });
      s = addLog(s, 'surrender', action.playerId, `${me.nickname} 기권`);
      const active = s.players.filter(isActive);
      if (active.length <= 1) return { state: finishGame(s, 'last-standing') };
      if (s.phase === 'reveal') return { state: maybeBeginPlay(s) };
      if (s.currentPlayerId !== action.playerId) return { state: s };
      // 생선 냄새로 편 카드가 남아 있으면 더미 맨 위로 되돌린다
      if (s.peek !== null) s = { ...s, pile: [s.peek, ...s.pile], peek: null };
      if (s.stage === 'chore') return { state: afterPick(s, me.seat) };
      return { state: advance(s) };
    }
    default:
      return reject(state, '알 수 없는 행동입니다');
  }
}

// ---------------------------------------------------------------------------
// 시간 초과 자동 수 (Rules.md 6.3절). 서버가 쓴다
// ---------------------------------------------------------------------------

/**
 * 시간 초과 자동 수. 일과 고르기 = 남은 일과 중 펼친 순서로 첫 일과, 가져오기 = 마켓 맨 앞 카드,
 * 심기 = 맨 앞 카드부터 심을 수 있는 첫 칸·방향 0(씨앗 없음, 없으면 버리기), 담 넘기 = 첫 내 칸에서 첫 맞닿은 칸으로 1개 한 번,
 * 명당 부르기 = 첫 식물 칸을 지금 방향으로(가져올 수 있으면 마켓 맨 앞 카드)
 */
export function autoAction(state: GameState, playerId: PlayerId): Action | null {
  const me = getPlayer(state, playerId);
  if (!me || !isActive(me)) return null;
  // 공개 단계: 확인 (차례가 없으므로 currentPlayerId 와 무관)
  if (state.phase === 'reveal') return me.isReady ? null : { type: 'CONFIRM', playerId };
  if (state.phase !== 'playing' || state.currentPlayerId !== playerId) return null;
  switch (state.stage) {
    case 'chore': {
      const chore = remainingChores(state)[0];
      return chore ? { type: 'PICK_CHORE', playerId, chore } : null;
    }
    case 'take':
      if (state.market.length > 0) return { type: 'TAKE', playerId, take: 0 };
      return state.peek !== null ? { type: 'TAKE', playerId, take: 'peek' } : null;
    case 'move': {
      const from = legalMoveSources(state, playerId)[0];
      const to = from ? legalMoveTargets(state, from)[0] : undefined;
      return from && to ? { type: 'MOVE', playerId, moves: [{ from, to, count: 1 }] } : null;
    }
    case 'call': {
      const pos = legalCallCells(state, playerId)[0];
      if (!pos) return null;
      const rotation = state.plants.find((p) => samePos(p.pos, pos))?.rotation ?? 0;
      return canCallTake(state, playerId) ? { type: 'CALL', playerId, pos, rotation, take: 0 } : { type: 'CALL', playerId, pos, rotation };
    }
    case 'plant':
      break;
  }
  if (me.hand.length === 0) return null;
  // 맨 앞 카드부터, 심을 수 있는 첫 카드를 첫 칸에 회전 0으로 (씨앗은 놓지 않는다)
  for (const s of me.hand) {
    const c = legalPlantCells(state, playerId, s)[0];
    if (c) return { type: 'PLANT', playerId, species: s, pos: c, rotation: 0 };
  }
  return { type: 'DISCARD', playerId, species: me.hand[0] as SpeciesId };
}
