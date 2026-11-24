import { describe, expect, it } from 'vitest';
import { cycleMarket, drawCard, takeFromMarket } from './market';
import { createGame } from './setup';
import { GameError } from './state';
import { FOUR_PLAYERS, seededRng } from './test-utils';

describe('이적 시장 (p.3, p.15, p.25)', () => {
  it('구매 시 자리 제거 → 오른쪽으로 밀림 → 맨 왼쪽 보충', () => {
    const s = createGame(FOUR_PLAYERS, seededRng());
    const before = [...s.market.players];
    const top = s.decks.starters[0]!;
    const taken = takeFromMarket(s, 'players', 3, seededRng());
    expect(taken).toBe(before[3]);
    expect(s.market.players).toEqual([top, before[0], before[1], before[2], before[4]]);
  });

  it('맨 왼쪽 2장은 구매 불가', () => {
    const s = createGame(FOUR_PLAYERS, seededRng());
    expect(() => takeFromMarket(s, 'players', 1, seededRng())).toThrow(GameError);
    expect(() => takeFromMarket(s, 'players', 5, seededRng())).toThrow(GameError);
  });

  it('주말 순환: 맨 오른쪽을 버리고 왼쪽에 보충', () => {
    const s = createGame(FOUR_PLAYERS, seededRng());
    const before = [...s.market.staff];
    cycleMarket(s, 'staff', seededRng());
    expect(s.decks.discards.staff).toEqual([before[4]]);
    expect(s.market.staff.slice(1)).toEqual(before.slice(0, 4));
    expect(s.market.staff).toHaveLength(5);
  });

  it('더미가 비면 버린 더미를 섞어 다시 쓴다', () => {
    const deck: string[] = [];
    const discard = ['x', 'y', 'z'];
    const drawn = drawCard(deck, discard, seededRng());
    expect(['x', 'y', 'z']).toContain(drawn);
    expect(discard).toHaveLength(0);
    expect(deck).toHaveLength(2);
    expect(drawCard([], [], seededRng())).toBeUndefined();
  });
});
