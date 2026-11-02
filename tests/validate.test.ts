import { describe, expect, it } from 'vitest';
import { chooseActions } from '../src/core/ai';
import { mulberry32 } from '../src/core/rng';
import { applyAction, initialState, isOver } from '../src/core/rules';
import type { GameState } from '../src/core/types';
import { isGameState } from '../src/core/validate';

const json = (s: GameState): unknown => JSON.parse(JSON.stringify(s));

describe('isGameState', () => {
  it('실제 대국의 모든 상태를 받아들인다', () => {
    const rng = mulberry32(7);
    let s = initialState();
    let n = 0;
    while (!isOver(s)) {
      expect(isGameState(json(s))).toBe(true);
      for (const a of chooseActions(s, rng)) {
        s = applyAction(s, a);
        expect(isGameState(json(s))).toBe(true);
        n++;
      }
    }
    expect(n).toBeGreaterThan(20);
  });

  it('모양이 틀린 값을 거부한다', () => {
    expect(isGameState(null)).toBe(false);
    expect(isGameState({ ...initialState(), holes: [[], [], []] })).toBe(false);
    expect(isGameState({ ...initialState(), phase: 'nope' })).toBe(false);
    expect(isGameState({ ...initialState(), current: 2 })).toBe(false);
  });

  const base: GameState = { ...initialState(), phase: 'place', setupLeft: [0, 0], holes: [[0, 1], [1], [0], [], [], []] };
  it.each<[string, Partial<GameState>]>([
    ['빈 버스로 순회 중', { phase: 'sow', bus: [] }],
    ['빈 보드에서 출발 선택', { phase: 'pick', holes: [[], [], [], [], [], []] }],
    ['이번 턴 투입을 이미 마쳤는데 투입 단계', { placedThisTurn: 1 }],
    ['배치 토큰이 없는데 배치 단계', { phase: 'setup', setupLeft: [0, 4] }],
    ['예비군이 없는데 투입 단계', { reserves: [0, 11] }],
    ['토큰이 처음보다 많음', { reserves: [14, 11] }],
  ])('단계와 맞지 않는 상태를 거부한다: %s', (_, patch) => {
    expect(isGameState(json(base))).toBe(true);
    expect(isGameState(json({ ...base, ...patch }))).toBe(false);
  });
});
