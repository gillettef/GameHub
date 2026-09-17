import type { MatchReport } from './match';
import type { ScoreBreakdown } from './scoring';
import type { Division, Effect, InfrastructureType, PlayerTokens, Resources, Role, Sector, TrackPositions } from './types';

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
  placed: Partial<Resources>; // 경기 전 올려놓은 자원
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

// 대상 선택이 필요한 효과는 여기 쌓이고, 참가자가 resolvePending 으로 처리한다
export interface PendingEffect {
  id: string;
  effect: Effect;
  source: string;
  candidates: string[]; // 선수 instanceId 목록
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
export interface Market {
  players: string[];
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
  discards: { players: string[]; staff: string[]; sponsors: string[]; board: string[] };
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

export interface MatchAftermath {
  opponentCardId: string;
  played: string[];
  report: MatchReport;
  roll: number | null;
  decided: boolean;
}

export type Phase =
  | { kind: 'setup.draft'; round: 1 | 2 | 3; hands: Record<PlayerId, string[]>; picked: Record<PlayerId, string | null> }
  | { kind: 'setup.objective'; options: Record<PlayerId, string[]>; chosen: Record<PlayerId, string | null> }
  | { kind: 'monday.board'; meetings: Record<PlayerId, BoardMeeting> }
  | { kind: 'weekday'; day: Weekday; current: PlayerId; basicDone: boolean; paidDone: boolean }
  | { kind: 'friday.prepare'; submitted: Record<PlayerId, LineupSubmission | null> }
  | { kind: 'friday.aftermath'; matches: Record<PlayerId, MatchAftermath> }
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

export interface GameState {
  id: string;
  division: Division;
  week: number; // 1~6
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
    case 'friday.aftermath':
      return 'fri';
    case 'gameOver':
      return 'weekend';
  }
}

export function addLog(state: GameState, text: string, opts: { actor?: PlayerId; day?: LogDay } = {}): void {
  state.log.push({ id: state.log.length + 1, week: state.week, day: opts.day ?? currentDay(state), actor: opts.actor, text });
}

export function leftOf(state: GameState, pid: PlayerId): PlayerId {
  const i = state.seats.indexOf(pid);
  if (i < 0) throw new GameError(`unknown player: ${pid}`);
  return state.seats[(i + 1) % state.seats.length]!;
}

export function getPlayer(state: GameState, pid: PlayerId): PlayerState {
  const p = state.players[pid];
  if (!p) throw new GameError(`unknown player: ${pid}`);
  return p;
}

export function emptyTokens(): PlayerTokens {
  return { injury: 0, suspension: 0, strengthTemp: 0, strengthPerm: 0, weaknessTemp: 0, weaknessPerm: 0 };
}
