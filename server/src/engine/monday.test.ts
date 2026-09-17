import { describe, expect, it } from 'vitest';
import { cards } from './cards';
import { acceptBoardRoll, rerollBoardDie, rollBoardDie, tallyVotes, winningColor } from './monday';
import { GameError } from './state';
import { RESOURCES } from './types';
import { gameAtMonday, seededRng } from './test-utils';

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
