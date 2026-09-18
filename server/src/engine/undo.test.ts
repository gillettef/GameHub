import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { GameError, canUndoTurn } from './state';
import type { GameState } from './state';
import { gameAtMonday, seededRng } from './test-utils';
import { startWeekday } from './weekday';

// 주중 "처음으로 되돌리기": 차례의 첫 행동 직전 상태를 찍어 두고, 차례를 끝내기 전까지 그 상태로 복원한다 (원작에 없는 편의 기능)
function tuesday(): GameState {
  const s = gameAtMonday();
  startWeekday(s);
  for (const id of s.seats) {
    s.players[id]!.resources = { money: 20, fandom: 2, ops: 4, stamina: 2 };
    s.players[id]!.pending = [];
  }
  return s;
}

const strip = (s: GameState) => {
  const { turnSnapshot, log, ...rest } = s;
  void turnSnapshot;
  void log;
  return rest;
};

describe('undoTurn', () => {
  it('행동 전에는 되돌릴 것이 없고, 행동 후에는 차례 시작 상태로 돌아간다', () => {
    const rng = seededRng(3);
    const s0 = tuesday();
    expect(canUndoTurn(s0, 'a')).toBe(false);
    expect(() => applyAction(s0, 'a', { type: 'undoTurn' }, rng)).toThrow(GameError);

    const s1 = applyAction(s0, 'a', { type: 'recruitProspect' }, rng);
    expect(canUndoTurn(s1, 'a')).toBe(true);
    expect(s1.players.a!.roster.length).toBe(s0.players.a!.roster.length + 1);
    const s2 = applyAction(s1, 'a', { type: 'cardAction', source: { kind: 'staff', index: 0 }, paid: true }, rng);

    const back = applyAction(s2, 'a', { type: 'undoTurn' }, rng);
    expect(strip(back)).toEqual(strip(s0));
    expect(back.turnSnapshot).toBeUndefined();
    expect(back.log[back.log.length - 1]!.text).toContain('되돌림');
    // 되돌린 뒤 다시 행동하면 새 스냅샷이 찍힌다
    const again = applyAction(back, 'a', { type: 'pass' }, rng);
    expect(canUndoTurn(again, 'a')).toBe(true);
  });

  it('차례를 끝내면 되돌릴 수 없고, 다른 참가자는 남의 차례를 되돌릴 수 없다', () => {
    const rng = seededRng(4);
    let s = tuesday();
    s = applyAction(s, 'a', { type: 'pass' }, rng);
    expect(() => applyAction(s, 'b', { type: 'undoTurn' }, rng)).toThrow(GameError);
    s = applyAction(s, 'a', { type: 'endTurn' }, rng);
    expect(s.phase.kind === 'weekday' && s.phase.current).toBe('b');
    expect(canUndoTurn(s, 'a')).toBe(false);
    expect(canUndoTurn(s, 'b')).toBe(false);
    expect(() => applyAction(s, 'b', { type: 'undoTurn' }, rng)).toThrow(GameError);
    // b 가 행동하면 b 의 차례 스냅샷이 새로 찍힌다
    s = applyAction(s, 'b', { type: 'pass' }, rng);
    expect(canUndoTurn(s, 'b')).toBe(true);
  });
});
