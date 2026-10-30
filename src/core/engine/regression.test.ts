import { describe, expect, it } from 'vitest';
import { createGame } from './setup';
import { applyAction, runSteps } from './turn';
import { advanceEraStart } from './era';
import { chooseAction } from '../ai';
import { totalColonists } from './derive';
import { COLONIST_TOTAL } from '../data/constants';
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
      { type: 'takeCard', slot: 1.5 },
      { type: 'hack' },
    ];
    for (const a of bad) {
      const r = applyAction(s, s.current, a as Action);
      expect(r.error).toBeTruthy();
      expect(r.state).toBe(s);
    }
  });

  it('시대 전환: 위협 공존 결정이 후원 계약 요구 검사보다 먼저 처리된다', () => {
    let s = createGame(2, seats(2));
    while (s.pending.length) s = applyAction(s, s.pending[0].player, { type: 'respond', choice: 0 }).state;
    const p = s.players[0];
    p.doctrine.symbiont = 5; // 주 노선 공생, 공존하면 7
    p.units.guard[3] = 3;
    p.patrons = ['pa7']; // 요구: 공생 6 이상
    s.players[1].units.guard[3] = 3;
    s.questSlots = ['q1t5', null]; // 전원 대상 위협
    advanceEraStart(s);
    runSteps(s);
    expect(s.pending[0]).toMatchObject({ kind: 'coexist', player: 0 });
    const cultureBefore = s.players[0].res.culture;
    s = applyAction(s, 0, { type: 'respond', choice: 1 }).state;
    expect(s.era).toBe(2);
    expect(s.players[0].doctrine.symbiont).toBe(7);
    expect(s.players[0].res.culture).toBe(cultureBefore + 2); // 요구 충족: 문화 +1시대×2
  });

  it('분쟁은 판정 가능한 방위 행동이 없으면 선포할 수 없다', () => {
    let s = createGame(1, seats(2));
    while (s.pending.length) s = applyAction(s, s.pending[0].player, { type: 'respond', choice: 0 }).state;
    s.era = 2;
    const r = applyAction(s, s.current, { type: 'declareConflict', target: 1 - s.current, loss: 'culture' });
    expect(r.error).toContain('방위 행동 3');
  });
});
