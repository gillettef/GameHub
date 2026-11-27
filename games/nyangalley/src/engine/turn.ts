/**
 * 로비 → 이번 판 식물 공개 → 라운드(차례마다 행동 하나: 가져오기 2장 / 놓기 / 명당 부르기) → 종료
 * (Rules.md 4·5·6·9절, 2026-11-27 v8 「행동 하나」).
 * 순수 함수. `applyAction(state, action) => { state, error? }`. 입력 state 를 변이하지 않는다.
 */
import { CREW_COUNT, GOAL_COUNT, HAND_MAX, TAKE_COUNT, START_HAND, MAX_PLAYERS, MIN_PLAYERS, rulesFor } from './data/constants.js';
import { FLOWER_SPECIES, FOREST_SPECIES, GOALS, SPECIES_IDS, getGoal, getSpecies, isSpeciesId } from './data/species.js';
import type { Action, Direction, GameLogEntry, GameResultReason, GameState, GoalId, LogKind, Plant, PlayerId, PlayerKind, PlayerState, Position, RoundStage, SpeciesId } from './types.js';
import { buildBoard, cellLabel, cellLabels, isDirection, samePos } from './board.js';
import { callRoots, computeOwners, entranceRoots, legalCallCells, legalPlantCells, legalSeedCells, plantRoots, supplyLeft } from './influence.js';
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
    stage: 'act',
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
  return { id, nickname, kind, seat: 0, isReady: kind === 'ai', hand: [], surrenderedOrder: null, crew: null };
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
  const players = bySeat(state).map((p) => ({ ...p, hand: pile.splice(0, START_HAND), surrenderedOrder: null, isReady: p.kind === 'ai', crew: null }));
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
    stage: 'act',
    roundStart: 0,
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
  return beginRound({ ...assignCrews(state), phase: 'playing' }, 1, first.seat);
}

/** 무리를 고르지 않은(랜덤·AI·기권) 자리에 남은 무리를 정한다 (Rules.md 4절 8·11절: 남은 무리를 번호 순으로 놓고 보드 시드로 섞어 자리 순서대로) */
function assignCrews(state: GameState): GameState {
  const taken = new Set(state.players.map((p) => p.crew).filter((c): c is number => typeof c === 'number'));
  const free = Array.from({ length: CREW_COUNT }, (_, i) => i).filter((c) => !taken.has(c));
  const shuffled = shuffle(free, state.rngSeed);
  const pool = [...shuffled.items];
  const crews = new Map(bySeat(state).map((p) => [p.id, typeof p.crew === 'number' ? p.crew : (pool.shift() ?? p.seat)]));
  return { ...state, rngSeed: shuffled.seed, players: state.players.map((p) => ({ ...p, crew: crews.get(p.id) ?? p.seat })) };
}

/** 무리 고르기 검사 (Rules.md 4절 8): 공개 단계, 기권 안 함, 확인 전, 0~CREW_COUNT−1 또는 null(랜덤), 남이 고른 무리는 안 됨 */
export function validatePickCrew(state: GameState, a: { playerId: PlayerId; crew: unknown }): string | null {
  if (state.phase !== 'reveal') return '이번 판 명당 공개 단계에서만 무리를 고를 수 있습니다';
  const me = getPlayer(state, a.playerId);
  if (!me) return '없는 플레이어입니다';
  if (!isActive(me)) return '기권한 플레이어는 고를 수 없습니다';
  if (me.isReady) return '이미 확인했습니다';
  if (a.crew === null) return null;
  if (!Number.isInteger(a.crew) || (a.crew as number) < 0 || (a.crew as number) >= CREW_COUNT) return '없는 무리입니다';
  if (state.players.some((p) => p.id !== a.playerId && p.crew === a.crew)) return '다른 사람이 이미 고른 무리입니다';
  return null;
}


// ---------------------------------------------------------------------------
// 진행 (Rules.md 5절, v8 「행동 하나」)
// ---------------------------------------------------------------------------

const isActive = (p: PlayerState) => p.surrenderedOrder === null;
/** 자리 순서로 정렬한 플레이어 */
const bySeat = (state: GameState): PlayerState[] => [...state.players].sort((a, b) => a.seat - b.seat);

/** 손패의 어떤 카드라도 심을 칸이 있는가 */
export function hasAnyPlant(state: GameState, playerId: PlayerId): boolean {
  const me = getPlayer(state, playerId);
  if (!me || !state.board) return false;
  return [...new Set(me.hand)].some((s) => legalPlantCells(state, playerId, s).length > 0);
}

/** 가져오기(한 장)를 할 수 있는가: 손이 HAND_MAX 장 미만이고 마켓이나 더미에 카드가 있다 (Rules.md 5.1 1) */
export function canTake(state: Pick<GameState, 'players' | 'market' | 'pile'> & { pileCount?: number }, playerId: PlayerId): boolean {
  const me = state.players.find((p) => p.id === playerId);
  const pileN = state.pile.length || (state.pileCount ?? 0);
  return !!me && me.hand.length < HAND_MAX && (state.market.length > 0 || pileN > 0);
}

/** 이번 차례에 할 수 있는 행동 (Rules.md 5.1). 화면 안내·자동 수·쉼 판단에 쓴다 */
export interface ActOptions {
  take: boolean;
  plant: boolean;
  /** 심을 칸이 없는데 손에 카드가 있다 */
  discard: boolean;
  call: boolean;
}

export function actOptions(state: GameState, playerId: PlayerId): ActOptions {
  const me = getPlayer(state, playerId);
  if (!me || !state.board) return { take: false, plant: false, discard: false, call: false };
  const plant = hasAnyPlant(state, playerId);
  return { take: canTake(state, playerId), plant, discard: !plant && me.hand.length > 0, call: legalCallCells(state, playerId).length > 0 };
}

const canAct = (o: ActOptions) => o.take || o.plant || o.discard || o.call;

function finishGame(state: GameState, reason: GameResultReason): GameState {
  const scores = computeScores(state);
  const ranking = computeRanking(state, scores);
  const winner = ranking[0] ?? null;
  let s: GameState = { ...state, phase: 'finished', currentPlayerId: null, market: [], result: { reason, ranking, scores } };
  const summary = ranking.map((id, i) => `${i + 1}위 ${nameOf(s, id)} ${scores[id]?.total ?? 0}점`).join(', ');
  s = addLog(s, 'result', winner, `게임 종료${reason === 'last-standing' ? ' (남은 사람 1명)' : ''}: ${summary}`);
  return s;
}

/**
 * 다음 라운드의 선 (Rules.md 5.2): 공급처에 큐브가 가장 많이 남은 기권 안 한 사람.
 * 동점이면 이번 선의 다음 자리부터 시계방향으로 처음 만나는 동점자(이번 선은 마지막 후보)
 */
export function nextRoundStart(state: GameState): number {
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

/** 라운드를 연다: 선부터 차례 */
function beginRound(state: GameState, round: number, start: number): GameState {
  let s: GameState = { ...state, round, roundStart: start };
  const lead = s.players.find((p) => p.seat === start) as PlayerState;
  s = addLog(s, 'system', lead.id, `${round}라운드: ${lead.nickname} 선`);
  const first = nextInRound(s, null, isActive);
  return first ? enterTurn(s, first) : finishGame(s, 'complete');
}

/** 차례를 연다. 할 수 있는 행동이 없으면 기록만 남기고 다음 사람으로 넘어간다 (Rules.md 5.1) */
function enterTurn(state: GameState, next: PlayerState): GameState {
  let s = state;
  let p: PlayerState | null = next;
  while (p) {
    s = { ...s, currentPlayerId: p.id, turn: s.turn + 1, stage: 'act' };
    s = addLog(s, 'turn', p.id, `${p.nickname}의 차례`);
    if (canAct(actOptions(s, p.id))) return s;
    s = addLog(s, 'pass', p.id, `${p.nickname}: 할 수 있는 일이 없어 이번 차례를 쉼`);
    p = nextInRound(s, p.seat, isActive);
  }
  return endRound(s);
}

/** 라운드 끝 (Rules.md 5.2·9절): 라운드 수를 채웠거나 더미·마켓·손이 모두 비면 종료, 아니면 다음 선으로 다음 라운드 */
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
  act: '타일 가져오기 · 명당 놓기 · 명당 부르기 중 하나를 하세요',
  take: '가져오기 중입니다. 펼친 타일이나 주머니에서 1개를 더 가져오세요',
};

/** 지금 이 사람의 차례인가(단계까지). 아니면 거부 사유 */
function turnError(state: GameState, playerId: PlayerId, stages: readonly RoundStage[]): string | null {
  if (state.phase !== 'playing') return '진행 중인 게임이 아닙니다';
  if (state.currentPlayerId !== playerId) return '내 차례가 아닙니다';
  if (!stages.includes(state.stage)) return STAGE_HINT[state.stage];
  return null;
}

/** 가져오기 한 장 검사 (Rules.md 5.1 1). take: 마켓 번호, 'pile' = 카드 더미 맨 위 1장(뒷면). 더미 두 번째 장('take' 단계)은 'pile' 만 */
export function validateTake(state: GameState, a: { playerId: PlayerId; take: unknown }): string | null {
  const err = turnError(state, a.playerId, ['act', 'take']);
  if (err) return err;
  const me = getPlayer(state, a.playerId);
  if (!me) return '없는 플레이어입니다';
  if (me.hand.length >= HAND_MAX) return `손 타일은 ${HAND_MAX}개까지입니다. 명당을 놓거나 부르세요`;
  if (a.take === 'pile') return state.pile.length > 0 ? null : '주머니가 비었습니다. 펼친 타일에서 가져오세요';
  if (state.stage === 'take') return '주머니에서 가져오는 중입니다. 주머니에서 1개를 더 가져오세요';
  if (!Number.isInteger(a.take) || (a.take as number) < 0 || (a.take as number) >= state.market.length) return '없는 타일입니다';
  return null;
}

const isPos = (p: unknown): p is Position => {
  const v = p as Record<string, unknown> | null;
  return !!v && typeof v === 'object' && Number.isInteger(v.q) && Number.isInteger(v.r);
};

/** 데려올 칸 목록: 생략하거나, 칸 좌표 배열(길이는 한 차례에 놓을 수 있는 고양이 수를 넘지 않게 32 이하) */
const isFromList = (f: unknown): boolean => f === undefined || (Array.isArray(f) && f.length <= 32 && f.every(isPos));

export function validatePlant(state: GameState, a: Extract<Action, { type: 'PLANT' }>): string | null {
  if (!isPos(a.pos) || (a.seed !== undefined && !isPos(a.seed))) return '잘못된 놓기 요청입니다';
  if (!isFromList(a.from)) return '잘못된 데려올 칸입니다';
  if (a.rotation !== undefined && !isDirection(a.rotation)) return '잘못된 회전입니다';
  const err = turnError(state, a.playerId, ['act']);
  if (err) return err;
  const me = getPlayer(state, a.playerId);
  if (!me) return '없는 플레이어입니다';
  if (!isSpeciesId(a.species) || !me.hand.includes(a.species)) return '손에 없는 타일입니다';
  const sp = getSpecies(a.species);
  if (!legalPlantCells(state, a.playerId, a.species).some((p) => samePos(p, a.pos))) {
    return sp.pondPlanting ? '내 칸, 내 칸·아지트와 맞닿은 빈 칸, 개울 옆 빈 칸에만 놓을 수 있습니다' : '내 칸이나 내 칸·아지트와 맞닿은 빈 칸에만 놓을 수 있습니다';
  }
  if (a.seed !== undefined) {
    if (!sp.seed) return '이 명당은 멀리 보낼 고양이가 없습니다';
    if (!legalSeedCells(state, a.pos).some((p) => samePos(p, a.seed as Position))) return '멀리 보내는 고양이는 놓은 칸에서 두 칸 안, 고양이가 앉을 수 있는 칸에만 보낼 수 있습니다';
  }
  return null;
}

/**
 * 가져오기 (Rules.md 5.1 1): 마켓 한 장(빈자리는 더미 맨 위로 바로 채움)이면 그것으로 차례 끝.
 * 카드 더미 맨 위(뒷면)면 TAKE_COUNT 장까지: 첫 장('act') 뒤에 손이 HAND_MAX 장 미만이고 더미가 남았으면 두 번째 장('take', 더미만), 아니면 차례 끝
 */
function applyTake(state: GameState, action: Extract<Action, { type: 'TAKE' }>): ActionResult {
  const err = validateTake(state, action);
  if (err) return reject(state, err);
  const me = getPlayer(state, action.playerId) as PlayerState;
  const pile = [...state.pile];
  let s: GameState;
  if (action.take === 'pile') {
    // 카드 더미 맨 위 1장: 본인만 본다. 기록에 식물 이름을 남기지 않는다 (Rules.md 5절)
    const card = pile.shift() as SpeciesId;
    s = updatePlayer({ ...state, pile }, action.playerId, { hand: [...me.hand, card] });
    s = addLog(s, 'take', action.playerId, `${me.nickname}: 주머니에서 1개 뽑음`);
  } else {
    const card = state.market[action.take] as SpeciesId;
    const market = state.market.filter((_, i) => i !== action.take);
    if (pile.length) market.push(pile.shift() as SpeciesId);
    s = updatePlayer({ ...state, market, pile }, action.playerId, { hand: [...me.hand, card] });
    s = addLog(s, 'take', action.playerId, `${me.nickname}: 펼친 타일에서 ${getSpecies(card).name} 가져옴`);
  }
  const taken = state.stage === 'act' ? 1 : TAKE_COUNT;
  const room = (getPlayer(s, action.playerId)?.hand.length ?? HAND_MAX) < HAND_MAX;
  if (action.take === 'pile' && taken < TAKE_COUNT && room && s.pile.length > 0) return { state: { ...s, stage: 'take' } };
  return { state: advance(s) };
}

/** 심기 (Rules.md 6절): 식물을 놓고 뿌리를 뻗은 뒤 손에서 카드를 빼고 차례를 넘긴다 */
function applyPlant(state: GameState, action: Extract<Action, { type: 'PLANT' }>): ActionResult {
  const err = validatePlant(state, action);
  if (err) return reject(state, err);
  const sp = getSpecies(action.species);
  const rotation = (action.rotation ?? 0) as Direction;
  const seed = action.seed && sp.seed ? { q: action.seed.q, r: action.seed.r } : null;
  const plant = { id: `p${state.plants.length + 1}`, species: action.species, ownerId: action.playerId, pos: { q: action.pos.q, r: action.pos.r }, rotation };
  let s: GameState = { ...state, plants: [...state.plants, plant] };
  const res = plantRoots(s, action.playerId, action.species, action.pos, rotation, seed, action.from);
  if (res.fromError) return reject(state, res.fromError);
  s = spendCard({ ...s, rootSeat: res.rootSeat, rootCount: res.rootCount }, action.playerId, action.species);
  const me = getPlayer(state, action.playerId) as PlayerState;
  const board = state.board as NonNullable<GameState['board']>;
  s = addLog(s, 'plant', action.playerId, `${me.nickname}: ${cellLabel(board, action.pos)}에 ${sp.name} 놓음${seed ? `, 멀리 ${cellLabel(board, seed)}` : ''}`);
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

/** 명당 부르기 검사 (Rules.md 5.1 3) */
export function validateCall(state: GameState, a: Extract<Action, { type: 'CALL' }>): string | null {
  if (!isPos(a.pos)) return '잘못된 명당 부르기 요청입니다';
  if (a.rotation !== undefined && !isDirection(a.rotation)) return '잘못된 회전입니다';
  if (!isFromList(a.from)) return '잘못된 데려올 칸입니다';
  const err = turnError(state, a.playerId, ['act']);
  if (err) return err;
  if (!legalCallCells(state, a.playerId).some((p) => samePos(p, a.pos))) return '내 칸 위에 있는 명당만 부를 수 있습니다';
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
  const res = callRoots(s, action.playerId, action.pos, rotation, action.from);
  if (res.fromError) return reject(state, res.fromError);
  s = { ...s, rootSeat: res.rootSeat, rootCount: res.rootCount };
  s = addLog(s, 'call', me.id, `${me.nickname}: ${cellLabel(board, action.pos)}의 ${getSpecies(old.species).name} 명당을 부름${rotation !== old.rotation ? ' (방향을 바꿈)' : ''}`);
  s = logRootChanges(state, s, me, res.uprooted);
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
    case 'PICK_CREW': {
      const err = validatePickCrew(state, action);
      if (err) return reject(state, err);
      return { state: updatePlayer(state, action.playerId, { crew: action.crew }) };
    }
    case 'TAKE':
      return applyTake(state, action);
    case 'PLANT':
      return applyPlant(state, action);
    case 'DISCARD': {
      const err = turnError(state, action.playerId, ['act']);
      if (err) return reject(state, err);
      const me = getPlayer(state, action.playerId);
      if (!me || !me.hand.includes(action.species)) return reject(state, '손에 없는 타일입니다');
      if (hasAnyPlant(state, action.playerId)) return reject(state, '놓을 수 있는 칸이 있으면 버릴 수 없습니다');
      let s = spendCard(state, action.playerId, action.species);
      s = addLog(s, 'discard', action.playerId, `${me.nickname}: 놓을 곳이 없어 ${getSpecies(action.species).name} 버림`);
      return { state: advance(s) };
    }
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
      return { state: advance(s) };
    }
    default:
      return reject(state, '알 수 없는 행동입니다');
  }
}

// ---------------------------------------------------------------------------
// 시간 초과 자동 수 (Rules.md 6.3절). 서버가 쓴다
// ---------------------------------------------------------------------------

/** 가져오기 자동 수: 마켓 맨 앞 카드, 마켓이 비었으면 더미 맨 위 */
const autoTake = (state: GameState, playerId: PlayerId): Action => ({ type: 'TAKE', playerId, take: state.market.length > 0 && state.stage !== 'take' ? 0 : 'pile' });

/**
 * 시간 초과 자동 수 (Rules.md 6.3). 행동 고르기 = 심을 수 있으면 맨 앞 카드부터 심을 수 있는 첫 카드를 첫 칸·방향 0(씨앗 없음),
 * 아니면 가져오기(마켓 맨 앞, 없으면 더미), 아니면 첫 식물 칸을 지금 방향으로 부르기, 아니면 맨 앞 카드 버리기.
 * 주머니 두 번째 장 = 더미 맨 위
 */
export function autoAction(state: GameState, playerId: PlayerId): Action | null {
  const me = getPlayer(state, playerId);
  if (!me || !isActive(me)) return null;
  // 공개 단계: 확인 (차례가 없으므로 currentPlayerId 와 무관)
  if (state.phase === 'reveal') return me.isReady ? null : { type: 'CONFIRM', playerId };
  if (state.phase !== 'playing' || state.currentPlayerId !== playerId) return null;
  if (state.stage === 'take') return canTake(state, playerId) ? autoTake(state, playerId) : null;
  for (const s of me.hand) {
    const c = legalPlantCells(state, playerId, s)[0];
    if (c) return { type: 'PLANT', playerId, species: s, pos: c, rotation: 0 };
  }
  if (canTake(state, playerId)) return autoTake(state, playerId);
  const pos = legalCallCells(state, playerId)[0];
  if (pos) return { type: 'CALL', playerId, pos, rotation: state.plants.find((p) => samePos(p.pos, pos))?.rotation ?? 0 };
  return me.hand.length ? { type: 'DISCARD', playerId, species: me.hand[0] as SpeciesId } : null;
}
