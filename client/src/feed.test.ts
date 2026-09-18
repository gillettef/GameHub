import { describe, expect, it } from 'vitest';
import { acceptBoardRoll, rollBoardDie } from '@server/engine/monday';
import { gameAtMonday, seededRng } from '@server/engine/test-utils';
import { viewFor } from '@server/engine/view';
import { diffPlayer } from './feed';
import { myTask } from './notify';

// 효과 토스트의 변화 계산과 턴 알림의 "내 할 일" 판정 (둘 다 서버 뷰만 보고 판단한다)
describe('diffPlayer', () => {
  it('자원·트랙·승점·토큰·영입 변화를 칩으로 뽑아낸다', () => {
    const s = gameAtMonday();
    const before = viewFor(s, 'a');
    const next = structuredClone(s);
    const p = next.players.a!;
    p.resources.money += 3;
    p.tracks.fandom += 1;
    p.vp += 2;
    p.roster[0]!.tokens.injury += 1;
    const after = viewFor(next, 'a');
    const deltas = diffPlayer(before.players.a!, after.players.a!, before.league.players.a, after.league.players.a);
    expect(deltas).toEqual(
      expect.arrayContaining([
        { kind: 'resource', resource: 'money', amount: 3 },
        { kind: 'track', track: 'fandom', delta: 1 },
        { kind: 'vp', amount: 2 },
        expect.objectContaining({ kind: 'token', token: 'injury', count: 1 }),
      ]),
    );
    expect(deltas).toHaveLength(4);
  });

  it('변화가 없으면 빈 배열', () => {
    const s = gameAtMonday();
    const v = viewFor(s, 'a');
    expect(diffPlayer(v.players.a!, v.players.a!, 0, 0)).toEqual([]);
  });
});

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
    view.players[other]!.pending = [{ id: 'x', source: '테스트', effect: { type: 'trainPlayer', count: 1 }, candidates: [] }];
    expect(myTask(view)).toBe('효과 대상을 고르세요');
  });
});
