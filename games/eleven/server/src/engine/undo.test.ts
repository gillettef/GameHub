import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { GameError, canUndoTurn } from './state';
import { viewFor } from './view';
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

// 되돌리기 비교에서 뺄 것: 스냅샷·기록
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

    const s1 = applyAction(s0, 'a', { type: 'buildInfrastructure', infrastructure: 'shop' }, rng);
    expect(canUndoTurn(s1, 'a')).toBe(true);
    expect(s1.players.a!.infrastructure).toEqual(['shop']);
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

  // 사용자 결정(2026-09): 카드가 공개되는 행동(시장 보충·유망주 영입·전술 카드 뽑기 등) 뒤에는 되돌릴 수 없다 — 본 정보를 무를 수 없으므로
  it('카드를 공개한 차례는 되돌릴 수 없고, 그 뒤 행동을 더 해도 계속 잠긴다', () => {
    const rng = seededRng(5);
    const s0 = tuesday();
    // 유망주 영입: 더미 다음 카드가 공개된다
    const prospect = applyAction(s0, 'a', { type: 'recruitProspect' }, rng);
    expect(canUndoTurn(prospect, 'a')).toBe(false);
    const v = viewFor(prospect, 'a');
    expect(v.phase.kind === 'weekday' && v.phase.canUndo).toBe(false);
    expect(() => applyAction(prospect, 'a', { type: 'undoTurn' }, rng)).toThrow(/revealed/);
    // 잠긴 뒤 유급 행동을 해도 스냅샷이 새로 찍히지 않는다 (잠금 유지)
    const more = applyAction(prospect, 'a', { type: 'cardAction', source: { kind: 'staff', index: 0 }, paid: true }, rng);
    expect(canUndoTurn(more, 'a')).toBe(false);
    expect(() => applyAction(more, 'a', { type: 'undoTurn' }, rng)).toThrow(GameError);

    // 시장 구매(주전·베테랑·직원·스폰서)는 왼쪽에 새 카드가 보충되므로 마찬가지
    for (const action of [
      { type: 'recruitPlayer', marketIndex: 4 },
      { type: 'recruitPlayer', marketIndex: 4, row: 'veterans' },
      { type: 'hireStaff', marketIndex: 4 },
      { type: 'signSponsor', marketIndex: 4, contract: 'kit' },
    ] as const) {
      const s = applyAction(s0, 'a', action, rng);
      expect(canUndoTurn(s, 'a'), action.type).toBe(false);
    }
    // 공개가 없는 행동(건설·사무실·방출·패스)은 그대로 되돌릴 수 있다
    for (const action of [{ type: 'buildOffice' }, { type: 'pass' }, { type: 'releasePlayer', instanceId: s0.players.a!.roster[0]!.instanceId }] as const) {
      const s = applyAction(s0, 'a', action, rng);
      expect(canUndoTurn(s, 'a'), action.type).toBe(true);
    }
    // 차례가 끝나면 잠금도 함께 사라지고 다음 참가자는 정상
    const ended = applyAction(more, 'a', { type: 'endTurn' }, rng);
    const b = applyAction(ended, 'b', { type: 'pass' }, rng);
    expect(canUndoTurn(b, 'b')).toBe(true);
  });

  // 사용자 요청(2026-09): 선수를 훈련하면(훈련 면 공개) 그 차례는 되돌릴 수 없다 — 유망주를 훈련해 보고 마음에 안 들면 무르는 것을 막는다
  it('선수를 훈련한 차례는 되돌릴 수 없다', () => {
    const rng = seededRng(7);
    const s0 = tuesday();
    // 첫 번째 트레이너 카드 행동: 선수 1명 훈련 → 후보(베테랑·유망주)가 둘이라 대상 선택 대기
    const chosen = applyAction(s0, 'a', { type: 'cardAction', source: { kind: 'staff', index: 0 } }, rng);
    expect(chosen.players['a']!.pending).toHaveLength(1);
    expect(canUndoTurn(chosen, 'a')).toBe(true); // 아직 아무 카드도 공개되지 않았다
    const pending = chosen.players['a']!.pending[0]!;
    const trained = applyAction(chosen, 'a', { type: 'resolvePending', pendingId: pending.id, choice: pending.candidates[0]! }, rng);
    expect(trained.players['a']!.roster.find((r) => r.instanceId === pending.candidates[0])!.trained).toBe(true);
    expect(canUndoTurn(trained, 'a')).toBe(false);
    expect(() => applyAction(trained, 'a', { type: 'undoTurn' }, rng)).toThrow(/revealed/);
  });
});
