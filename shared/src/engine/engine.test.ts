import { describe, expect, it } from 'vitest';
import { applyAction, createInitialState, createPlayer } from './index.js';
import type { GameState } from '../types/index.js';

function playingState(): GameState {
  const base = createInitialState('room-1');
  return {
    ...base,
    phase: 'playing',
    currentPlayerId: 'p1',
    players: [createPlayer('p1', '철수'), createPlayer('p2', '영희')],
  };
}

describe('applyAction END_TURN', () => {
  it('턴을 다음 플레이어에게 넘기고 로그를 남긴다', () => {
    const state = playingState();
    const result = applyAction(state, { type: 'END_TURN', playerId: 'p1' });
    expect(result.error).toBeUndefined();
    expect(result.state.currentPlayerId).toBe('p2');
    expect(result.state.turn).toBe(1);
    expect(result.state.log).toHaveLength(1);
  });

  it('자신의 턴이 아니면 거부하고 상태를 바꾸지 않는다', () => {
    const state = playingState();
    const result = applyAction(state, { type: 'END_TURN', playerId: 'p2' });
    expect(result.error).toBeDefined();
    expect(result.state).toBe(state);
  });

  it('입력 상태를 변이하지 않는다', () => {
    const state = playingState();
    const snapshot = JSON.stringify(state);
    applyAction(state, { type: 'END_TURN', playerId: 'p1' });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
