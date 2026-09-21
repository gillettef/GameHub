import type { MatchReport } from './match';
import type { ScoreBreakdown } from './scoring';
import type { DayRestriction, Division, Effect, InfrastructureType, MarketRow, Passive, PlayerTokens, Resources, Role, Sector, TrackPositions } from './types';

export type PlayerId = string;

export class GameError extends Error {}

// 유니폼 토큰 13개 (p.8): 번호 2~11 10개 + 번호 없는 토큰 3개. 골키퍼(1번)는 토큰 없음
export interface UniformToken {
  id: string;
  number?: number;
  face: Role;
  location: 'field' | 'bench';
  cardInstanceId?: string;
}

export interface PlayerInstance {
  instanceId: string;
  cardId: string;
  trained: boolean;
  tokens: PlayerTokens;
  placed: Partial<Resources>; // 경기 준비 때 효과 활성화용으로 올려놓은 자원 (경기 후 버림)
  stamina: number; // 카드 효과(placeStamina)로 미리 올려놓은 체력. 출전하면 1개를 출전 체력(p.20 3)으로 쓰고 남은 것은 경기 후 버린다(p.24 4). 미출전이면 남는다
  exhausted: boolean;
  careerVP: number; // 유망주 경력 칸에 놓인 승점 토큰 (p.16)
  careerUsed: { appearances: number; goals: number };
}

export interface StaffInstance {
  cardId: string;
  exhausted: boolean;
  suspension: number;
}

export interface ExecutiveInstance {
  cardId: string;
  exhausted: boolean;
}

// 대상 선택이 필요한 효과는 여기 쌓이고, 참가자가 resolvePending 으로 처리한다.
// target 에 따라 candidates 는 선수 instanceId / 직원 index / 이적 시장 index / 유니폼 토큰 id
export type PendingTarget = 'player' | 'staff' | 'market' | 'token';
export interface PendingEffect {
  id: string;
  effect: Effect;
  source: string;
  target: PendingTarget;
  candidates: string[];
  row?: MarketRow; // target === 'market' 일 때 어느 행
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  resources: Resources;
  tracks: TrackPositions;
  executives: ExecutiveInstance[];
  staff: StaffInstance[];
  roster: PlayerInstance[];
  uniforms: UniformToken[];
  sponsors: { naming?: string; billboards: string[] };
  infrastructure: InfrastructureType[];
  office: number; // 사무실 트랙 인덱스 0~4
  tacticCards: string[];
  objective?: string;
  opponentDeck: string[]; // index 0 = 다음 상대
  scouted: boolean; // 다음 상대 카드의 앞면을 미리 봤는가 (peekOpponent 효과). 그 카드로 경기하면 풀린다
  restrictions: { week: number; day: Weekday; mode: DayRestriction }[]; // 이사회 효과의 요일 제한(점검용 토큰). 그 주가 끝나면 버린다
  passives: { passive: Passive; source: string }[]; // 상시 효과 (스폰서 추가 보너스 등). source = 카드 이름
  upkeepDiscount: number; // 다음 주말 유지비 할인
  tacticRedrawn: boolean; // 이번 경기일에 특성으로 전술 카드를 새로 뽑았는가 (경기일마다 1회)
  freeRerollUsed: { board: boolean; match: boolean }; // 특성(팬덤 없이 재굴림)을 이번 주에 썼는가 — 주당 1회, 주말에 초기화 (사용자 결정, 2026-09)
  // 목표 카드 판정용 기록 (p.27, engine/objectives.ts)
  matchHistory: { week: number; outcome: 'win' | 'draw' | 'loss'; myGoals: number; theirGoals: number }[];
  matchDieInjured: boolean; // 경기 영향 주사위로 부상 토큰을 받은 적이 있는가
  kitSponsors: number; // 장내 방송 계약 횟수 (카드는 버려지므로 따로 센다)
  vp: number; // 개인 공급처의 승점 토큰
  pending: PendingEffect[];
  nextInstance: number;
}

export interface LeagueOpponent {
  teamId: string;
  position: number;
  active: boolean;
}

// 이적 시장 각 행 5장. index 4 = 맨 오른쪽. 구매 가능 = index 2~4 (p.15)
// players = 주전 선수 행, veterans = 베테랑 행(원작에 없는 행, 사용자 결정 2026-09). 유망주는 행 없이 decks.prospects[0] 을 영입한다
export interface Market {
  players: string[];
  veterans: string[];
  staff: string[];
  sponsors: string[];
}

export interface Decks {
  starters: string[];
  prospects: string[];
  veterans: string[];
  staff: string[];
  sponsors: string[];
  board: string[];
  tactics: string[];
  objectives: string[];
  // 버린 더미. players = 주전, veterans = 베테랑 (각자 더미가 비면 섞어 새 더미로). prospects 는 다시 섞지 않는다
  discards: { players: string[]; veterans: string[]; prospects: string[]; staff: string[]; sponsors: string[]; board: string[] };
}

export interface BoardMeeting {
  card: string;
  roll: number | null;
  decided: boolean;
}

export type Weekday = 'tue' | 'wed' | 'thu';
export const WEEKDAYS: readonly Weekday[] = ['tue', 'wed', 'thu'];

// 경기 준비 제출 (p.20)
export interface LineupSubmission {
  tacticCardId: string;
  formationIndex: number;
  players: string[]; // 출전 선수 instanceId (골키퍼 포함)
  placements: Record<string, Sector>; // 필드 유니폼 토큰 id → 구획
  activations?: Record<string, Partial<Resources>>; // 선수 카드에 올려놓을 추가 자원
  fandomInStands?: number;
}

// 경기 판정 전에 쌓이는 보정치: 경기 전 효과·전술 효과·경기 중 효과가 넣는다
export interface MatchMods {
  mine: number; // 효과로 미리 넣은 내 골
  theirs: number;
  extraSaves: number;
  denyGoals: number;
  sectorSkill: Partial<Record<Sector, number>>;
  deferred: { source: string; effect: Effect; instanceId?: string }[]; // 경기 후 다시 판정할 조건부 효과
}
export function emptyMods(): MatchMods {
  return { mine: 0, theirs: 0, extraSaves: 0, denyGoals: 0, sectorSkill: {}, deferred: [] };
}

export interface MatchAftermath {
  opponentCardId: string;
  played: string[];
  placements: Record<string, Sector>; // 경기에 쓴 배치 (결과 화면에서 구획별 선수·득점자를 보여 준다. 경기가 끝났으니 공개)
  report: MatchReport;
  roll: number | null;
  // 경기 영향이 부상류면 그 결과를 적용한 뒤 12면체 부상 주사위를 참가자가 직접 굴린다 (p.24·p.27, 사용자 요청 2026-09).
  // "두 번의 (심각한) 부상"이면 2개. 앞에서부터 하나씩 굴림 → (팬덤 재굴림) → 적용. count = 놓을 부상 토큰 수
  injuryDice: InjuryDie[];
  decided: boolean;
}
export interface InjuryDie {
  count: number;
  roll: number | null;
  applied: boolean;
}
// 지금 굴릴(또는 적용할) 부상 주사위. 없으면 undefined
export function currentInjuryDie(m: Pick<MatchAftermath, 'injuryDice'>): InjuryDie | undefined {
  return m.injuryDice.find((d) => !d.applied);
}

export type Phase =
  | { kind: 'setup.draft'; round: 1 | 2 | 3; hands: Record<PlayerId, string[]>; picked: Record<PlayerId, string | null> }
  | { kind: 'setup.objective'; options: Record<PlayerId, string[]>; chosen: Record<PlayerId, string | null> }
  // 준비(임원 드래프트·목표 선택)만 전원 동시. 월요일 이사회부터는 모든 단계를 선 참가자부터 시계방향으로
  // 한 명씩(current) 진행한다 (규칙서는 월요일·금요일을 동시 진행으로 두지만, 온라인에서는 서로의 진행을 지켜볼 수 있도록 턴제로 바꿨다)
  | { kind: 'monday.board'; current: PlayerId; meetings: Record<PlayerId, BoardMeeting> }
  | { kind: 'weekday'; day: Weekday; current: PlayerId; basicDone: boolean; paidDone: boolean }
  // preMatch: 경기 전 효과·전술 효과가 쌓는 보정치 (경기 전 효과는 라인업 제출 시점에 적용되므로 판정 때까지 들고 있는다)
  | { kind: 'friday.prepare'; current: PlayerId; submitted: Record<PlayerId, LineupSubmission | null>; preMatch: Record<PlayerId, MatchMods> }
  // p.21 경기 진행: 상대 팀 카드 공개 후 전술 효과 카드 1장 선택(또는 생략). effectCard = 결정한 참가자의 카드(null = 생략)
  | { kind: 'friday.match'; current: PlayerId; submitted: Record<PlayerId, LineupSubmission>; preMatch: Record<PlayerId, MatchMods>; effectCard: Record<PlayerId, string | null>; decided: Record<PlayerId, boolean> }
  | { kind: 'friday.aftermath'; current: PlayerId; matches: Record<PlayerId, MatchAftermath> }
  | { kind: 'gameOver'; scores: Record<PlayerId, ScoreBreakdown>; winners: PlayerId[] };

export type LogDay = 'setup' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'weekend';

// 공개 행동 기록. 주차·요일·행위자로 구분해 클라이언트가 묶어 보여준다
export interface LogEntry {
  id: number;
  week: number;
  day: LogDay;
  actor?: PlayerId;
  text: string;
}

// 주중 차례 시작 시점의 상태. 그 차례의 첫 행동 직전에 찍어 두고, 참가자가 "처음으로 되돌리기"를 하면 복원한다.
// locked: 이번 차례에 비공개 카드가 공개됐다(시장 보충·유망주 영입·전술 카드 뽑기 등) — 본 정보를 무를 수 없으므로 그 차례는 되돌리기 불가
export interface TurnSnapshot {
  pid: PlayerId;
  week: number;
  day: Weekday;
  locked: boolean;
  state: Omit<GameState, 'turnSnapshot'>;
}

export interface GameState {
  id: string;
  division: Division;
  week: number; // 1~6
  turnSnapshot?: TurnSnapshot; // 뷰에는 내려보내지 않는다 (다른 참가자의 비공개 정보 포함)
  phase: Phase;
  seats: PlayerId[]; // 시계 방향 순서
  firstPlayer: PlayerId;
  players: Record<PlayerId, PlayerState>;
  market: Market;
  decks: Decks;
  league: { players: Record<PlayerId, number>; opponents: LeagueOpponent[] };
  log: LogEntry[];
}

export function currentDay(state: GameState): LogDay {
  switch (state.phase.kind) {
    case 'setup.draft':
    case 'setup.objective':
      return 'setup';
    case 'monday.board':
      return 'mon';
    case 'weekday':
      return state.phase.day;
    case 'friday.prepare':
    case 'friday.match':
    case 'friday.aftermath':
      return 'fri';
    case 'gameOver':
      return 'weekend';
  }
}

// 주중 내 차례의 스냅샷이 현재 차례(참가자·주차·요일)의 것인가
export function hasTurnSnapshot(state: GameState, pid: PlayerId): boolean {
  const snap = state.turnSnapshot;
  return state.phase.kind === 'weekday' && state.phase.current === pid && !!snap && snap.pid === pid && snap.week === state.week && snap.day === state.phase.day;
}

// "처음으로 되돌리기" 가능 = 이번 차례의 스냅샷이 있고 그 사이 카드가 공개되지 않았다
export function canUndoTurn(state: GameState, pid: PlayerId): boolean {
  return hasTurnSnapshot(state, pid) && !state.turnSnapshot!.locked;
}

export function addLog(state: GameState, text: string, opts: { actor?: PlayerId; day?: LogDay } = {}): void {
  state.log.push({ id: state.log.length + 1, week: state.week, day: opts.day ?? currentDay(state), actor: opts.actor, text });
}

export function leftOf(state: GameState, pid: PlayerId): PlayerId {
  const i = state.seats.indexOf(pid);
  if (i < 0) throw new GameError(`unknown player: ${pid}`);
  return state.seats[(i + 1) % state.seats.length]!;
}

// 선 참가자부터 시계방향으로 아직 마치지 않은 첫 참가자. 전원 마쳤으면 null
export function nextInTurn(state: GameState, done: (pid: PlayerId) => boolean): PlayerId | null {
  const start = state.seats.indexOf(state.firstPlayer);
  for (let i = 0; i < state.seats.length; i++) {
    const pid = state.seats[(start + i) % state.seats.length]!;
    if (!done(pid)) return pid;
  }
  return null;
}

export function requireTurn(phase: { current: PlayerId }, pid: PlayerId): void {
  if (phase.current !== pid) throw new GameError('not your turn');
}

export function getPlayer(state: GameState, pid: PlayerId): PlayerState {
  const p = state.players[pid];
  if (!p) throw new GameError(`unknown player: ${pid}`);
  return p;
}

export function emptyTokens(): PlayerTokens {
  return { injury: 0, suspension: 0, strengthTemp: 0, strengthPerm: 0, weaknessTemp: 0, weaknessPerm: 0 };
}
