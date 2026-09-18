import { describe, expect, it } from 'vitest';
import { createGame } from './setup';
import { FOUR_PLAYERS, gameAtMonday, seededRng } from './test-utils';
import { viewFor } from './view';

describe('참가자 뷰 (비공개 정보 제거)', () => {
  it('드래프트: 내 손패만 보이고 다른 참가자는 장수만', () => {
    const s = createGame(FOUR_PLAYERS, seededRng());
    const v = viewFor(s, 'a');
    if (v.phase.kind !== 'setup.draft' || s.phase.kind !== 'setup.draft') throw new Error();
    expect(v.phase.hand).toEqual(s.phase.hands['a']);
    expect(v.phase.handSizes).toEqual({ a: 4, b: 4, c: 4, d: 4 });
    expect(JSON.stringify(v)).not.toContain(s.phase.hands['b']![0]);
  });

  it('목표 카드·전술 손패·상대 팀 덱은 본인 것만', () => {
    const s = gameAtMonday();
    const v = viewFor(s, 'a');
    expect(v.self.objective).toBe(s.players['a']!.objective);
    expect(v.self.tacticCards).toEqual(s.players['a']!.tacticCards);
    expect(JSON.stringify(v.players['b'])).not.toContain(s.players['b']!.objective!);
    expect(v.players['b']!.hasObjective).toBe(true);
    expect(v.players['b']!.tacticCardCount).toBe(1);
    expect(v.players['b']!.nextOpponent).toBe(s.players['b']!.opponentDeck[0]);
    expect(v.players['b']!.opponentsLeft).toBe(6);
    expect(JSON.stringify(v)).not.toContain(s.players['b']!.opponentDeck[1]!);
  });

  it('덱은 장수만, 시장과 리그는 공개', () => {
    const s = gameAtMonday();
    const v = viewFor(s, 'c');
    expect(v.deckCounts.starters).toBe(s.decks.starters.length);
    // 유망주 더미는 맨 위 카드만 공개(미훈련 면을 보고 영입), 그 아래는 비공개
    expect(v.nextProspect).toBe(s.decks.prospects[0]!);
    expect(JSON.stringify(v)).not.toContain(s.decks.prospects[1]!);
    expect(JSON.stringify(v)).not.toContain(s.decks.starters[0]!);
    expect(JSON.stringify(v)).not.toContain(s.decks.veterans[0]!);
    expect(v.market).toEqual(s.market);
    expect(v.market.veterans).toHaveLength(5);
    expect(v.league).toEqual(s.league);
    expect(v.me).toBe('c');
  });
});
