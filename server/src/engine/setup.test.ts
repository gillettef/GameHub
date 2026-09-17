import { describe, expect, it } from 'vitest';
import { cards } from './cards';
import { createRng } from './rng';
import { chooseObjective, createGame, draftPick } from './setup';
import type { GameConfig } from './setup';
import type { GameState } from './state';
import { GameError } from './state';

const FOUR: GameConfig = {
  id: 'g1',
  division: 3,
  players: [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
    { id: 'd', name: 'D' },
  ],
};

function newGame(config: GameConfig = FOUR, seed = 42): GameState {
  return createGame(config, createRng(seed));
}

// 모든 참가자가 손패 첫 카드를 고르며 드래프트를 끝낸다
function runDraft(state: GameState): GameState {
  let s = state;
  for (let round = 0; round < 3; round++) {
    for (const id of s.seats) {
      if (s.phase.kind !== 'setup.draft') throw new Error('draft ended early');
      s = draftPick(s, id, s.phase.hands[id]![0]!);
    }
  }
  return s;
}

describe('createGame (p.4~p.10)', () => {
  it('이적 시장 3행 각 5장, 덱에서 제거됨', () => {
    const s = newGame();
    expect(s.market.players).toHaveLength(5);
    expect(s.market.staff).toHaveLength(5);
    expect(s.market.sponsors).toHaveLength(5);
    for (const id of s.market.players) expect(s.decks.starters).not.toContain(id);
    expect(s.decks.starters).toHaveLength(36 - 5);
  });

  it('각 참가자: 첫 번째 트레이너 1, 베테랑 1 + 유망주 1, 기본 전술 1, 트랙 2, 자원 0', () => {
    const s = newGame();
    for (const id of s.seats) {
      const p = s.players[id]!;
      expect(p.staff).toHaveLength(1);
      expect(cards.staff(p.staff[0]!.cardId).job).toBe('첫 번째 트레이너');
      expect(p.roster.map((r) => cards.player(r.cardId).kind).sort()).toEqual(['prospect', 'veteran']);
      expect(p.tacticCards).toHaveLength(1);
      expect(cards.tactic(p.tacticCards[0]!).basic).toBe(true);
      expect(p.tracks).toEqual({ money: 2, fandom: 2, ops: 2, stamina: 2 });
      expect(p.resources).toEqual({ money: 0, fandom: 0, ops: 0, stamina: 0 });
    }
  });

  it('상대 팀 6장: 쉬운 부 3장 위, 어려운 부 3장 아래, 각 3장은 팀이 서로 다름 (p.8 c)', () => {
    const s = newGame();
    const seen = new Set<string>();
    for (const id of s.seats) {
      const deck = s.players[id]!.opponentDeck;
      expect(deck).toHaveLength(6);
      const tiers = deck.map((c) => cards.opponent(c).tier);
      expect(tiers.slice(0, 3)).toEqual(['3', '3', '3']);
      expect(tiers.slice(3)).toEqual(['3/2', '3/2', '3/2']);
      for (const half of [deck.slice(0, 3), deck.slice(3)]) {
        expect(new Set(half.map((c) => cards.opponent(c).teamId)).size).toBe(3);
      }
      for (const c of deck) {
        expect(seen.has(c)).toBe(false);
        seen.add(c);
      }
    }
  });

  it('유니폼: 필드 10개(공격 5/수비 5), 벤치 3개, 선발 선수 토큰은 역할 면 (p.8 e)', () => {
    const s = newGame();
    for (const id of s.seats) {
      const p = s.players[id]!;
      const field = p.uniforms.filter((u) => u.location === 'field');
      expect(field).toHaveLength(10);
      expect(p.uniforms.filter((u) => u.location === 'bench')).toHaveLength(3);
      expect(field.filter((u) => u.face === 'attack')).toHaveLength(5);
      for (const r of p.roster) {
        const side = r.trained ? cards.player(r.cardId).trained : cards.player(r.cardId).untrained;
        const token = p.uniforms.find((u) => u.cardInstanceId === r.instanceId);
        expect(token?.location).toBe('field');
        expect(token?.face).toBe(side.role);
        if (side.number === undefined) expect(token?.number).toBeUndefined();
        else expect(token?.number).toBe(side.number);
      }
    }
  });

  it('리그 성적표: 참가자와 상대 팀 8팀 모두 0에서 시작 (p.10)', () => {
    const s = newGame();
    expect(s.league.opponents).toHaveLength(8);
    expect(s.league.opponents.every((o) => o.position === 0 && o.active)).toBe(true);
    expect(Object.values(s.league.players)).toEqual([0, 0, 0, 0]);
  });

  it('임원 드래프트: 손패 4장씩, 라운드 1', () => {
    const s = newGame();
    expect(s.phase.kind).toBe('setup.draft');
    if (s.phase.kind !== 'setup.draft') return;
    expect(s.phase.round).toBe(1);
    for (const id of s.seats) expect(s.phase.hands[id]).toHaveLength(4);
  });

  it('2인 게임에서는 3+ 직원 카드를 제외한다 (p.4)', () => {
    const s = newGame({ ...FOUR, players: FOUR.players.slice(0, 2) });
    const all = [...s.market.staff, ...s.decks.staff];
    expect(all.every((id) => cards.staff(id).minPlayers === 2)).toBe(true);
    expect(s.league.opponents).toHaveLength(8);
  });

  it('같은 시드면 같은 결과', () => {
    expect(newGame(FOUR, 7)).toEqual(newGame(FOUR, 7));
  });

  it('잘못된 설정 거부', () => {
    expect(() => newGame({ ...FOUR, players: [] })).toThrow(GameError);
    expect(() => newGame({ ...FOUR, firstPlayer: 'zzz' })).toThrow(GameError);
  });
});

describe('임원 드래프트 (p.7 c)', () => {
  it('고르고 남은 카드는 왼쪽 참가자에게, 3라운드 후 임원 3명', () => {
    let s = newGame();
    if (s.phase.kind !== 'setup.draft') throw new Error();
    const aHand = s.phase.hands['a']!;
    const aPick = aHand[1]!;
    for (const id of s.seats) {
      if (s.phase.kind !== 'setup.draft') throw new Error();
      s = draftPick(s, id, id === 'a' ? aPick : s.phase.hands[id]![0]!);
    }
    if (s.phase.kind !== 'setup.draft') throw new Error();
    expect(s.phase.round).toBe(2);
    expect(s.phase.hands['b']!.sort()).toEqual(aHand.filter((c) => c !== aPick).sort());
    expect(s.players['a']!.executives.map((e) => e.cardId)).toEqual([aPick]);

    s = runDraft(newGame());
    for (const id of s.seats) expect(s.players[id]!.executives).toHaveLength(3);
    expect(s.phase.kind).toBe('setup.objective');
  });

  it('공개 시 능력치 조정을 적용한다', () => {
    const s = runDraft(newGame());
    for (const id of s.seats) {
      const p = s.players[id]!;
      const expected = { money: 2, fandom: 2, ops: 2, stamina: 2 };
      for (const e of p.executives) {
        for (const [t, d] of Object.entries(cards.executive(e.cardId).trackAdjust)) {
          expected[t as keyof typeof expected] += d;
        }
      }
      for (const t of ['money', 'fandom', 'ops', 'stamina'] as const) {
        expect(p.tracks[t]).toBe(Math.min(5, Math.max(1, expected[t])));
      }
    }
  });

  it('손패에 없는 카드나 중복 선택은 거부', () => {
    const s = newGame();
    expect(() => draftPick(s, 'a', 'ex-99')).toThrow(GameError);
    if (s.phase.kind !== 'setup.draft') throw new Error();
    const hand = s.phase.hands['a']!;
    const s2 = draftPick(s, 'a', hand[0]!);
    expect(() => draftPick(s2, 'a', hand[1]!)).toThrow(GameError);
  });
});

describe('목표 카드 선택 (p.9 a)', () => {
  it('2장 중 1장 선택, 전원 선택 시 월요일로', () => {
    let s = runDraft(newGame());
    if (s.phase.kind !== 'setup.objective') throw new Error();
    for (const id of s.seats) expect(s.phase.options[id]).toHaveLength(2);
    expect(() => chooseObjective(s, 'a', 'ob-99')).toThrow(GameError);
    for (const id of s.seats) {
      if (s.phase.kind !== 'setup.objective') throw new Error();
      s = chooseObjective(s, id, s.phase.options[id]![1]!);
    }
    expect(s.phase.kind).toBe('monday.procurement');
    expect(s.week).toBe(1);
    for (const id of s.seats) expect(s.players[id]!.objective).toBeDefined();
  });
});
