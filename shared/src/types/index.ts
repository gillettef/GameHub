/**
 * 서버·클라이언트·AI 서비스가 공유하는 게임 도메인 타입.
 * ai/astral_ai/models.py 의 Pydantic 모델과 필드명·타입을 1:1로 맞춘다.
 *
 * 스캐폴딩 단계: 최소 골격만 정의한다. 카드·유닛·건물 상세는 Phase 1에서 채운다.
 */

export type PlayerId = string;
export type RoomId = string;

export interface Position {
  x: number;
  y: number;
}

export type PlayerKind = 'human' | 'ai';

export interface PlayerState {
  id: PlayerId;
  nickname: string;
  kind: PlayerKind;
  /** 현재 보유 자원 */
  resources: number;
  /** 현재 보유 마나 */
  mana: number;
}

export type GamePhase = 'lobby' | 'deck-building' | 'playing' | 'finished';

export interface GameState {
  roomId: RoomId;
  phase: GamePhase;
  turn: number;
  /** 현재 턴을 진행 중인 플레이어 */
  currentPlayerId: PlayerId | null;
  players: PlayerState[];
  board: {
    width: number;
    height: number;
  };
  /** 진행 탭에 표시되는 이벤트 로그 (최신이 뒤) */
  log: GameLogEntry[];
}

export interface GameLogEntry {
  turn: number;
  message: string;
}

/** 플레이어가 서버로 보내는 액션. 룰 엔진이 검증한다. */
export type Action = { type: 'END_TURN'; playerId: PlayerId };
