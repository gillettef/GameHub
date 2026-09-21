import { describe, expect, it } from 'vitest';
import { acceptBoardRoll, rollBoardDie } from '@server/engine/monday';
import { gameAtMonday, seededRng } from '@server/engine/test-utils';
import { viewFor } from '@server/engine/view';
import { myTask } from './notify';

// 턴 알림의 "내 할 일" 판정 (서버 뷰만 보고 판단한다)
describe('myTask', () => {
  it('이사회는 차례인 참가자에게만 할 일이 있다', () => {
    const s = gameAtMonday();
    if (s.phase.kind !== 'monday.board') throw new Error('monday expected');
    const current = s.phase.current;
    for (const id of s.seats) {
      const view = viewFor(s, id);
      view.players[id]!.pending = []; // 준비 단계 임원 보너스의 대상 선택은 별도 판정이라 제외
      const task = myTask(view);
      if (id === current) expect(task).toContain('주사위');
      else expect(task).toBeNull();
    }
  });

  it('주중은 차례인 참가자, 대상 선택 대기는 언제나 할 일', () => {
    let s = gameAtMonday();
    const rng = seededRng(7);
    let guard = 0;
    while (s.phase.kind === 'monday.board' && guard++ < 50) {
      const pid = s.phase.current;
      s = rollBoardDie(s, pid, rng);
      s = acceptBoardRoll(s, pid);
    }
    if (s.phase.kind !== 'weekday') throw new Error('weekday expected');
    const current = s.phase.current;
    for (const id of s.seats) {
      const view = viewFor(s, id);
      view.players[id]!.pending = [];
      expect(myTask(view)).toBe(id === current ? '화요일 행동 차례' : null);
    }
    const other = s.seats.find((id) => id !== current)!;
    const view = viewFor(s, other);
    view.players[other]!.pending = [{ id: 'x', source: '테스트', effect: { type: 'trainPlayer', count: 1 }, target: 'player', candidates: [] }];
    expect(myTask(view)).toBe('효과 대상을 고르세요');
  });
});
