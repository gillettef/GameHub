/** GameDef: 행동 검사, 좌석별로 가린 view, 사람 여럿의 동시 진행, 대리 봇으로 끝까지 */
import { RuleError, type SeatInfo } from '@gamehub/net';
import { describe, expect, it } from 'vitest';
import { actorsOf, def, parseAction, toView } from '../src/def';
import type { GameState } from '../src/engine/types';

const ctx = { name: (i: number) => `${i + 1}번`, log: () => {}, byBot: false };
const seats = (...kinds: SeatInfo['kind'][]): SeatInfo[] => kinds.map((kind, i) => ({ kind, name: kind === 'human' ? `사람${i + 1}` : `봇 ${i + 1}` }));

/** 지금 둘 사람마다 대리 봇의 수를 두어 끝까지 */
function playOut(s: GameState, limit = 5000): GameState {
  for (let k = 0; k < limit && !def.isOver(s); k++) {
    const seat = def.actors(s)[0];
    if (seat === undefined) throw new Error('둘 사람이 없는데 끝나지 않음');
    const a = def.bot!.next(s, seat, {});
    if (!a) throw new Error(`대리 봇이 둘 수 없음 ${s.phase}/${s.step}`);
    try {
      s = def.apply(s, seat, a, ctx);
    } catch (e) {
      s = def.apply(s, seat, def.bot!.fallback!(s, seat)!, ctx);
      void e;
    }
  }
  return s;
}

describe('parseAction', () => {
  it('형식이 맞는 행동만, 필요한 키만', () => {
    expect(parseAction({ type: 'buy', cardId: 3, slot: 5, extra: 1 })).toEqual({ type: 'buy', cardId: 3, slot: 5 });
    expect(parseAction({ type: 'buy', cardId: 3, slot: 6 })).toBeNull();
    expect(parseAction({ type: 'bid', amount: -1 })).toBeNull();
    expect(parseAction({ type: 'bid', amount: 1.5 })).toBeNull();
    expect(parseAction({ type: 'setFee', fee: 4 })).toBeNull();
    expect(parseAction({ type: 'place', index: 0, slot: null })).toEqual({ type: 'place', index: 0, slot: null });
    expect(parseAction({ type: 'place', index: 0 })).toBeNull();
    expect(parseAction({ type: 'hire', staff: 'boss' })).toBeNull();
    expect(parseAction({ type: 'hire', staff: 'guide' })).toEqual({ type: 'hire', staff: 'guide' });
    expect(parseAction({ type: 'endManage', seat: 2 })).toEqual({ type: 'endManage' });
    expect(parseAction({ type: '__proto__' })).toBeNull();
    expect(parseAction(null)).toBeNull();
  });
});

describe('사람 여럿(돌려 하기·온라인)', () => {
  it('차례가 아닌 좌석의 행동은 거절하고 상태를 건드리지 않는다', () => {
    const s = def.setup({ seats: seats('human', 'human', 'bot'), seed: 3, options: undefined });
    const actor = actorsOf(s)[0]!;
    const other = actor === 0 ? 1 : 0;
    const before = JSON.stringify(s);
    expect(() => def.apply(s, other, { type: 'pass' }, ctx)).toThrow(RuleError);
    expect(() => def.apply(s, 2, { type: 'pass' }, ctx)).toThrow(RuleError);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('입찰은 동시에, 공개 전에는 남의 입찰액이 가려진다', () => {
    let s = def.setup({ seats: seats('human', 'human', 'bot'), seed: 8, options: undefined });
    while (s.phase === 'construct') s = def.apply(s, actorsOf(s)[0]!, { type: 'pass' }, ctx);
    expect(s.step).toBe('bid');
    expect(actorsOf(s).sort()).toEqual([0, 1]);
    s = def.apply(s, 0, { type: 'bid', amount: 2 }, ctx);
    expect(actorsOf(s)).toEqual([1]);
    expect(() => def.apply(s, 0, { type: 'bid', amount: 1 }, ctx)).toThrow('이미 입찰했어요');
    const v1 = toView(s, 1);
    expect(v1.game.players[0]!.bid).toBeNull();
    expect(v1.game.players[2]!.bid).toBeNull(); // AI 입찰도 공개 전에는 비밀
    expect(v1.bidDone).toEqual([true, false, true]);
    expect(toView(s, 0).game.players[0]!.bid).toBe(2);
    expect(v1.game.rng).toBe(0);
    s = def.apply(s, 1, { type: 'bid', amount: 0 }, ctx);
    expect(s.step).toBe('pick');
    expect(toView(s, 1).game.players[0]!.bid).toBe(2);
  });

  it('운영은 각자 입장료→배치, 결과 전에는 남의 입장료·배치를 가리고 모두 마치면 결과', () => {
    let s = def.setup({ seats: seats('human', 'human'), seed: 21, options: undefined });
    while (s.phase !== 'operate') {
      const seat = actorsOf(s)[0]!;
      s = def.apply(s, seat, def.bot!.next(s, seat, {})!, ctx);
    }
    s = def.apply(s, 0, { type: 'setFee', fee: 1 }, ctx);
    s = def.apply(s, 0, { type: 'confirmFee' }, ctx);
    expect(s.opStep).toEqual(['place', 'fee']);
    expect(s.step).toBe('fee');
    expect(toView(s, 1).game.players[0]!.fee).toBe(0);
    s = def.apply(s, 0, { type: 'autoPlace' }, ctx);
    s = def.apply(s, 0, { type: 'confirmPlace' }, ctx);
    expect(actorsOf(s)).toEqual([1]);
    expect(toView(s, 1).game.players[0]!.place.every((x) => x === null)).toBe(true);
    s = def.apply(s, 1, { type: 'confirmFee' }, ctx);
    s = def.apply(s, 1, { type: 'confirmPlace' }, ctx);
    expect(s.step).toBe('result');
    expect(toView(s, 1).game.players[0]!.fee).toBe(1);
    s = def.apply(s, 0, { type: 'continue' }, ctx);
    expect(s.phase).toBe('operate');
    s = def.apply(s, 1, { type: 'continue' }, ctx);
    expect(s.phase).toBe('manage');
    s = def.apply(s, 1, { type: 'endManage' }, ctx);
    expect(() => def.apply(s, 1, { type: 'clean' }, ctx)).toThrow(RuleError);
    s = def.apply(s, 0, { type: 'endManage' }, ctx);
    expect(s.round).toBe(2);
  });

  for (const kinds of [['human', 'human', 'human', 'human', 'human'], ['human', 'bot', 'human'], ['bot', 'human']] as SeatInfo['kind'][][]) {
    it(`대리 봇으로 끝까지 (${kinds.join(',')})`, () => {
      const s = playOut(def.setup({ seats: seats(...kinds), seed: 99, options: undefined }));
      expect(s.phase).toBe('gameOver');
      expect(toView(s, 0).game.rng).toBe(s.rng); // 끝나면 모두 공개
    });
  }

  it('봇끼리 판은 0번 자리가 진행을 맡아 끝까지 간다', () => {
    const s0 = def.setup({ seats: seats('bot', 'bot', 'bot'), seed: 5, options: undefined });
    expect(s0.phase).not.toBe('gameOver');
    expect(s0.players[0]!.isAI).toBe(false);
    expect(s0.players.map((p) => p.name)).toEqual(['미니 파크', '코코 파크', '루루 파크']);
    expect(playOut(s0).phase).toBe('gameOver');
  });

  it('대리 봇은 판의 난수를 건드리지 않는다', () => {
    let s = def.setup({ seats: seats('human', 'bot'), seed: 4, options: undefined });
    while (s.phase === 'construct') s = def.apply(s, 0, { type: 'pass' }, ctx);
    const rng = s.rng;
    def.bot!.next(s, 0, {});
    expect(s.rng).toBe(rng);
  });
});
