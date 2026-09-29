import { describe, expect, it } from 'vitest';
import { BOARD_CARDS } from '../data';
import { cards } from './cards';
import { acceptBoardRoll, boardDecision, unaffordableCost, hasDecisiveFace, rerollBoardDie, rollBoardDie, tallyVotes, winningColor } from './monday';
import { GameError } from './state';
import { RESOURCES } from './types';
import { FOUR_PLAYERS, gameAtMonday, seededRng } from './test-utils';

describe('월요일 조달 (p.12)', () => {
  it('트랙 위치에 따라 자원을 얻고 이사회 카드를 1장씩 받는다', () => {
    const s = gameAtMonday();
    const { procurement } = cards.boardData;
    if (s.phase.kind !== 'monday.board') throw new Error();
    for (const id of s.seats) {
      const p = s.players[id]!;
      for (const r of RESOURCES) {
        // 임원 보너스로 자원을 더 받았을 수 있으므로 조달량 이상인지만 확인
        expect(p.resources[r]).toBeGreaterThanOrEqual(procurement[r][p.tracks[r] - 1]!);
      }
      expect(s.phase.meetings[id]!.card).toMatch(/^bc-/);
      expect(s.phase.meetings[id]!.roll).toBeNull();
    }
    expect(s.decks.board).toHaveLength(36 - 4);
  });
});

describe('이사회 (p.13)', () => {
  it('투표 집계와 최다 득표', () => {
    const s = gameAtMonday();
    const p = s.players['a']!;
    for (let face = 1; face <= 6; face++) {
      const t = tallyVotes(p, face);
      expect(t.yellow + t.blue + t.red).toBe(3);
    }
    expect(winningColor({ yellow: 2, blue: 1, red: 0 })).toBe('yellow');
    expect(winningColor({ yellow: 1, blue: 1, red: 1 })).toBeNull();
    expect(winningColor({ yellow: 0, blue: 0, red: 3 })).toBe('red');
  });

  it('굴림 결과는 항상 동수가 아니다 (동수는 무료 재굴림)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = rollBoardDie(gameAtMonday(undefined, seed), 'a', seededRng(seed));
      if (s.phase.kind !== 'monday.board') throw new Error();
      const roll = s.phase.meetings['a']!.roll!;
      expect(winningColor(tallyVotes(s.players['a']!, roll))).not.toBeNull();
    }
  });

  it('재굴림은 팬덤 1개를 소모하고, 없으면 거부', () => {
    let s = rollBoardDie(gameAtMonday(), 'a', seededRng());
    s.players['a']!.resources.fandom = 1;
    s = rerollBoardDie(s, 'a', seededRng(9));
    expect(s.players['a']!.resources.fandom).toBe(0);
    expect(() => rerollBoardDie(s, 'a', seededRng())).toThrow(GameError);
    expect(() => rollBoardDie(s, 'a', seededRng())).toThrow(GameError);
  });

  it('수락 시 결정 효과 적용, 전원 수락하면 화요일로', () => {
    let s = gameAtMonday();
    expect(() => acceptBoardRoll(s, 'a')).toThrow(GameError);
    for (const id of s.seats) {
      s = rollBoardDie(s, id, seededRng(3));
      s = acceptBoardRoll(s, id);
      expect(() => acceptBoardRoll(s, id)).toThrow(GameError);
    }
    expect(s.phase.kind).toBe('weekday');
    if (s.phase.kind !== 'weekday') return;
    expect(s.phase.day).toBe('tue');
    expect(s.phase.current).toBe(s.firstPlayer);
    expect(s.decks.discards.board).toHaveLength(4);
    expect(s.log.some((l) => l.text.includes('이사회') && l.day === 'mon' && l.week === 1)).toBe(true);
  });
});

// 온라인 구현의 확정 사항: 이사회는 선 참가자부터 시계방향으로 한 명씩 진행한다 (규칙서 p.13 은 동시 진행)
describe('이사회 차례 (턴제)', () => {
  it('선 참가자만 굴릴 수 있고, 결정하면 왼쪽 참가자로 넘어간다', () => {
    let s = gameAtMonday();
    if (s.phase.kind !== 'monday.board') throw new Error();
    expect(s.phase.current).toBe(s.firstPlayer);
    expect(() => rollBoardDie(s, 'b', seededRng())).toThrow('not your turn');
    s = acceptBoardRoll(rollBoardDie(s, 'a', seededRng()), 'a');
    if (s.phase.kind !== 'monday.board') throw new Error();
    expect(s.phase.current).toBe('b');
    expect(() => rollBoardDie(s, 'c', seededRng())).toThrow('not your turn');
  });

  it('선 참가자가 b 이면 b → c → d → a 순서로 진행한다', () => {
    let s = gameAtMonday({ ...FOUR_PLAYERS, firstPlayer: 'b' });
    if (s.phase.kind !== 'monday.board') throw new Error();
    const order: string[] = [];
    while (s.phase.kind === 'monday.board') {
      order.push(s.phase.current);
      const pid = s.phase.current;
      s = acceptBoardRoll(rollBoardDie(s, pid, seededRng(order.length)), pid);
    }
    expect(order).toEqual(['b', 'c', 'd', 'a']);
    expect(s.phase.kind).toBe('weekday');
  });
});

// 임원 3명의 표가 6면 모두 1-1-1 동수인 조합이 있다 — 재굴림으로 결정이 나지 않으므로 첫 임원의 표를 따른다
describe('모든 눈이 동수인 임원 조합', () => {
  const allTie = (s: ReturnType<typeof gameAtMonday>) => {
    // ex-03 [Y,Y,Y,B,B,R], ex-06 [B,B,B,R,R,Y], ex-11 [R,R,R,Y,Y,B] → 모든 눈이 1-1-1
    s.players['a']!.executives = ['ex-03', 'ex-06', 'ex-11'].map((cardId) => ({ cardId, exhausted: false }));
    return s;
  };

  it('굴림이 멈추지 않고 끝나며, 결정은 첫 임원의 표를 따른다', () => {
    const s = allTie(gameAtMonday());
    expect(hasDecisiveFace(s.players['a']!)).toBe(false);
    const rolled = rollBoardDie(s, 'a', seededRng(7));
    if (rolled.phase.kind !== 'monday.board') throw new Error();
    const face = rolled.phase.meetings['a']!.roll!;
    expect(face).toBeGreaterThanOrEqual(1);
    expect(boardDecision(s.players['a']!, face)).toBe(cards.executive('ex-03').votes[face - 1]);
    expect(rolled.log.some((l) => l.text.includes('모든 눈에서 동수'))).toBe(true);
    const accepted = acceptBoardRoll(rolled, 'a');
    if (accepted.phase.kind !== 'monday.board') throw new Error();
    expect(accepted.phase.meetings['a']!.decided).toBe(true);
  });
});

describe('이사회 결정의 비용 강제', () => {
  const pay = (resource: 'money' | 'ops', amount: number) => ({ type: 'gainResource' as const, resource, amount });
  const vp = { type: 'gainVP' as const, amount: 1 };
  const res = (money: number, ops = 0) => ({ resources: { money, fandom: 0, ops, stamina: 0 } });

  it('보상이 함께 있는 결정은 비용을 다 낼 수 없으면 이행하지 못한다', () => {
    expect(unaffordableCost(res(1), [pay('money', -2), vp])).toBe('money');
    expect(unaffordableCost(res(2), [pay('money', -2), vp])).toBeNull();
    expect(unaffordableCost(res(5, 1), [pay('money', -2), pay('ops', -2), vp])).toBe('ops');
  });

  it('앞에서 얻은 자원은 뒤의 비용에 쓸 수 있고, 보상 없이 손해만 있는 결정은 강제 페널티다', () => {
    expect(unaffordableCost(res(0), [pay('money', 2), pay('money', -2), vp])).toBeNull();
    expect(unaffordableCost(res(0), [pay('money', -2)])).toBeNull();
  });

  it('비용을 못 내면 자원도 그대로, 승점도 없다 (모든 이사회 카드 결정에 대해)', () => {
    let checked = 0;
    for (const card of BOARD_CARDS) {
      for (const color of ['yellow', 'blue', 'red'] as const) {
        const effects = card.decisions[color].effects;
        if (unaffordableCost(res(0), effects) === null) continue;
        const s = gameAtMonday();
        if (s.phase.kind !== 'monday.board') throw new Error();
        const pid = s.phase.current;
        const p = s.players[pid]!;
        p.resources = { money: 0, fandom: 0, ops: 0, stamina: 0 };
        s.phase.meetings[pid]!.card = card.id;
        const face = [1, 2, 3, 4, 5, 6].find((f) => boardDecision(p, f) === color);
        if (face === undefined) continue; // 이 임원 조합으로는 그 색이 안 나온다
        s.phase.meetings[pid]!.roll = face;
        checked++;
        const vpBefore = p.vp;
        const after = acceptBoardRoll(s, pid);
        expect(after.players[pid]!.resources).toEqual({ money: 0, fandom: 0, ops: 0, stamina: 0 });
        expect(after.players[pid]!.vp).toBe(vpBefore);
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
