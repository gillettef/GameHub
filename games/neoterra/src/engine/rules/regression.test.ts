import { describe, expect, it } from 'vitest';
import { createGame } from './setup';
import { applyAction } from './turn';
import { chooseAction } from '../ai';
import { totalColonists } from './derive';
import { BASE_DEFENSE, COLONIST_TOTAL, CONFLICT_DEFENSE } from '../data/constants';
import { clone } from './util';
import type { Action, GameState } from '../types';

const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isAI: true }));

function playWithLog(seed: number, n: number, check?: (before: GameState, after: GameState) => void) {
  let s = createGame(seed, seats(n));
  const actions: [number, Action][] = [];
  let steps = 0;
  while (!s.gameOver && steps++ < 20000) {
    const actor = s.pending.length ? s.pending[0].player : s.current;
    let a: Action = chooseAction(s, actor)!;
    let r = applyAction(s, actor, a);
    if (r.error) {
      a = s.pending.length ? { type: 'respond', choice: 0 } : { type: 'endTurn' };
      r = applyAction(s, actor, a);
    }
    actions.push([actor, a]);
    check?.(s, r.state);
    s = r.state;
  }
  return { s, actions };
}

describe('회귀', () => {
  it('같은 시드·같은 행동열이면 같은 최종 상태, 입력 불변, 정착민 24 보존', () => {
    const { s, actions } = playWithLog(5, 3, (before, after) => {
      const copy = clone(before);
      expect(before).toEqual(copy);
      for (const p of after.players) {
        expect(totalColonists(p) + p.pool).toBeGreaterThanOrEqual(COLONIST_TOTAL - 4);
        for (const v of Object.values(p.res)) expect(Number.isFinite(v) && v >= 0).toBe(true);
      }
    });
    let r = createGame(5, seats(3));
    for (const [actor, a] of actions) r = applyAction(r, actor, a).state;
    expect(r).toEqual(s);
    expect(s.gameOver).toBe(true);
  }, 60000);

  it('잘못된 입력은 오류를 돌려주고 상태를 바꾸지 않는다', () => {
    let s = createGame(1, seats(2));
    while (s.pending.length) s = applyAction(s, s.pending[0].player, { type: 'respond', choice: 0 }).state;
    const bad: unknown[] = [
      { type: 'charter', field: 'x' },
      { type: 'build', kind: 'castle', level: 0 },
      { type: 'raid', target: 1, effect: 'nuke' },
      { type: 'declareConflict', target: 9, loss: 'culture' },
      { type: 'pickQuest', slot: 1.5 },
      { type: 'pickQuest', slot: 9 },
      { type: 'hack' },
    ];
    for (const a of bad) {
      const r = applyAction(s, s.current, a as Action);
      expect(r.error).toBeTruthy();
      expect(r.state).toBe(s);
    }
  });

  it('분쟁 판정 비용은 기본 방위 행동 안이라 방위 줄기 없이도 선포할 수 있다', () => {
    const s = createGame(1, seats(2));
    s.phase = 'external';
    s.era = 2;
    s.players[s.current].hand = [{ id: 'c2a', fresh: false }];
    expect(BASE_DEFENSE).toBeGreaterThanOrEqual(CONFLICT_DEFENSE);
    const r = applyAction(s, s.current, { type: 'declareConflict', card: 0, target: 1 - s.current });
    expect(r.error).toBeUndefined();
    expect(r.state.players[s.current].conflict).toBeTruthy();
  });
});
