/** 0 = 🔵 파랑(선공), 1 = 🔴 빨강 */
export type Player = 0 | 1;

export type Phase = 'setup' | 'place' | 'pick' | 'sow' | 'over';

/**
 * 게임 상태. JSON 직렬화 가능한 순수 데이터만 담는다.
 * 프로토타입 대응: holes=h, reserves=r, setupLeft=su, current=p, phase=ph,
 * bus=bus, busPos=ptr, source=src, placedThisTurn=pc, version=n
 */
export interface GameState {
  /** 권역별 토큰 스택. holes[i][0]이 맨 아래 토큰(⚑ 깃발) */
  holes: Player[][];
  reserves: [number, number];
  setupLeft: [number, number];
  current: Player;
  phase: Phase;
  /** 버스에 탄 토큰 (태운 순서 유지) */
  bus: Player[];
  /** 버스 현재 위치(마지막 정차 권역) */
  busPos: number;
  /** 이번 순회의 출발 권역. 아직 없으면 -1 */
  source: number;
  /** 이번 턴에 투입한 예비군 수 */
  placedThisTurn: number;
  /** 적용된 액션 수. 온라인 동기화 시 최신 상태 판별용 */
  version: number;
}

export type Action =
  | { type: 'setup'; hole: number }
  | { type: 'place'; hole: number }
  | { type: 'endPlace' }
  | { type: 'pick'; hole: number }
  | { type: 'drop'; color: Player };

/** 액션 처리 중 일어난 일. UI 연출·로그용 */
export type GameEvent =
  | { type: 'setup'; player: Player; hole: number }
  | { type: 'place'; player: Player; hole: number }
  | { type: 'endPlace'; player: Player }
  | { type: 'pick'; player: Player; hole: number; count: number }
  | { type: 'drop'; player: Player; hole: number; color: Player; auto: boolean }
  /** 놓을 곳이 없어 버스 토큰이 소멸(낙선) */
  | { type: 'lost'; player: Player; tokens: Player[] }
  | { type: 'turnEnd'; next: Player }
  | { type: 'gameOver' };

/** 연출 단위 한 박자: 이 시점의 상태와 그 사이에 일어난 사건들 */
export interface Step {
  state: GameState;
  events: GameEvent[];
}
