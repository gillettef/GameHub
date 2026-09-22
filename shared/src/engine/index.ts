/**
 * 순수 함수 룰 엔진. `(state, action) => newState`. 입력 state를 변이하지 않는다.
 * 부수효과·난수·시간 의존 금지.
 */
import type { Action, GameState, PlayerState, RoomId } from '../types/index.js';
import { BOARD_HEIGHT, BOARD_WIDTH, INITIAL_MANA, INITIAL_RESOURCES } from '../data/index.js';

export interface ApplyResult {
  state: GameState;
  /** 액션이 거부된 경우 이유. 거부 시 state는 입력과 동일 */
  error?: string;
}

/** 로비 단계의 빈 게임 상태를 만든다. */
export function createInitialState(roomId: RoomId): GameState {
  return {
    roomId,
    phase: 'lobby',
    turn: 0,
    currentPlayerId: null,
    players: [],
    board: { width: BOARD_WIDTH, height: BOARD_HEIGHT },
    log: [],
  };
}

export function createPlayer(id: string, nickname: string, kind: PlayerState['kind'] = 'human'): PlayerState {
  return { id, nickname, kind, resources: INITIAL_RESOURCES, mana: INITIAL_MANA };
}

/** 액션을 검증하고 적용한다. 스캐폴딩 단계에서는 END_TURN만 지원한다. */
export function applyAction(state: GameState, action: Action): ApplyResult {
  switch (action.type) {
    case 'END_TURN': {
      if (state.phase !== 'playing') return { state, error: '게임이 진행 중이 아닙니다.' };
      if (state.currentPlayerId !== action.playerId) return { state, error: '자신의 턴이 아닙니다.' };
      const idx = state.players.findIndex((p) => p.id === action.playerId);
      const next = state.players[(idx + 1) % state.players.length];
      if (!next) return { state, error: '다음 플레이어를 찾을 수 없습니다.' };
      return {
        state: {
          ...state,
          turn: state.turn + 1,
          currentPlayerId: next.id,
          log: [...state.log, { turn: state.turn, message: `${action.playerId} 턴 종료 → ${next.id}` }],
        },
      };
    }
  }
}
