import { LocalGame } from '@gamehub/net/client';
import { describe, expect, it } from 'vitest';
import { def, fromEngine, playerId, type Action } from '../../def';
import type { Action as EngineAction, GameState, Plant } from '../../engine';
import { applyAction, boardIndex, computeOwners, legalCallCells, legalPlantCells, maskState } from '../../engine';
import { asState } from '../game/derived';
import { selectCanAct, selectCanCall, selectCanPlant, selectCanTake, selectTakingSecond, useGameStore } from './gameStore';

/** GameView 가 하는 연결(받은 상태 → store, store 의 행동 → LocalGame)을 그대로 흉내 낸 한 기기 판. 봇 없이 사람만 */
function start(players = 2) {
  useGameStore.getState().reset();
  const game = new LocalGame(def, {
    seats: Array.from({ length: players }, (_, i) => ({ kind: 'human' as const, name: `P${i}` })),
    seed: 3,
    options: { turnTime: null, tutorial: false },
  });
  const push = () => {
    const room = game.getState().room;
    const v = room.view!;
    useGameStore.getState().applyView({
      mode: 'hotseat',
      state: v.game,
      viewerId: v.me,
      hotseat: players > 1,
      tutorial: false,
      room: { connected: room.seats.map((_, i) => playerId(i)), autopilot: [], turnTimeLimitSec: null, turnDeadline: null, serverNow: 0 },
    });
    const err = game.getState().error;
    if (err) useGameStore.getState().rejected(err);
  };
  game.subscribe(push);
  push();
  useGameStore.getState().setSender((a) => {
    const action = fromEngine(a, useGameStore.getState().state!.turn) as Action;
    // 한 기기의 '확인하고 시작': 사람 자리마다 확인
    if (action.type === 'CONFIRM') {
      for (let k = 0; k < 4 && game.getState().room.view?.game.phase === 'reveal'; k++) game.act(action);
    } else game.act(action);
  });
  return game;
}

/** 엔진 상태를 직접 들고 도는 한 기기 판(특정 장면용). 보는 사람 = 차례인 사람 */
function engineHarness(initial: GameState) {
  useGameStore.getState().reset();
  let state = initial;
  const sent: EngineAction[] = [];
  const push = () =>
    useGameStore.getState().applyView({
      mode: 'hotseat',
      state: maskState(state, state.currentPlayerId),
      viewerId: state.currentPlayerId,
      hotseat: false,
      tutorial: false,
      room: { connected: ['p0', 'p1'], autopilot: [], turnTimeLimitSec: null, turnDeadline: null, serverNow: 0 },
    });
  useGameStore.getState().setSender((a) => {
    sent.push(a);
    const r = applyAction(state, a);
    if (r.error) useGameStore.getState().rejected(r.error);
    else state = r.state;
    push();
  });
  push();
  return { get: () => state, sent };
}

/** 2인 판을 시작해 공개 단계를 확인한 엔진 상태 (자리 0 의 행동 고르기) */
function started(): GameState {
  let s = def.setup({ seats: [{ kind: 'human', name: 'P0' }, { kind: 'human', name: 'P1' }], seed: 11, options: { turnTime: null, tutorial: false } }).game;
  for (const p of s.players) s = applyAction(s, { type: 'CONFIRM', playerId: p.id }).state;
  return s;
}

describe('이번 판 식물 공개 (Rules.md 4절 8)', () => {
  it('한 기기로는 공개 단계에서 시작하고, 확인 한 번으로 모두 확인되어 자리 0의 행동 고르기 차례가 된다', () => {
    start(3);
    const s0 = useGameStore.getState();
    expect(s0.state!.phase).toBe('reveal');
    expect(s0.viewerId).toBe('p0');
    expect(s0.handoffPending).toBe(false);
    s0.confirmReveal();
    const s1 = useGameStore.getState();
    expect(s1.state!.phase).toBe('playing');
    expect(s1.state!.players.every((p) => p.isReady)).toBe(true);
    expect(s1.viewerId).toBe('p0');
    expect(s1.handoffPending).toBe(false);
    expect(s1.state!.stage).toBe('act');
    expect(selectCanAct(s1)).toBe(true);
    // 처음 손 1장: 가져오기와 놓기를 모두 고를 수 있다
    expect(selectCanTake(s1)).toBe(true);
    expect(selectCanPlant(s1)).toBe(true);
  });
});

describe('행동 하나 (Rules.md 5.1)', () => {
  function toAct() {
    start(2);
    useGameStore.getState().confirmReveal();
  }

  it('가져오기: 첫 타일을 가져오면 같은 사람이 두 번째를 가져오고(놓기는 못 함), 두 번째 뒤에 다음 사람 차례가 된다', () => {
    toAct();
    const s0 = useGameStore.getState();
    const taken = s0.state!.market[1]!;
    s0.takeCard(1);
    const s1 = useGameStore.getState();
    expect(s1.state!.players.find((p) => p.id === 'p0')!.hand.at(-1)).toBe(taken);
    expect(s1.state!.stage).toBe('take');
    expect(s1.viewerId).toBe('p0');
    expect(s1.handoffPending).toBe(false);
    expect(selectTakingSecond(s1)).toBe(true);
    expect(selectCanTake(s1)).toBe(true);
    expect(selectCanPlant(s1)).toBe(false);
    s1.selectHandCard(0);
    expect(useGameStore.getState().selectedHandIndex).toBeNull();
    useGameStore.getState().takeCard('pile');
    const s2 = useGameStore.getState();
    expect(s2.viewerId).toBe('p1');
    expect(s2.handoffPending).toBe(true);
    expect(s2.state!.players.find((p) => p.id === 'p0')!.handCount).toBe(3);
    // 다음 사람에게는 자기 손만 보인다
    expect(s2.state!.players.find((p) => p.id === 'p0')!.hand).toEqual([]);
  });

  it('놓기: 내 타일을 고르고 칸을 눌러 미리 본 뒤 놓으면 가져오지 않고 다음 사람 차례가 된다', () => {
    toAct();
    const s = useGameStore.getState();
    const me = s.viewerId!;
    const hand = s.state!.players.find((p) => p.id === me)!.hand;
    expect(hand).toHaveLength(1);
    const market = [...s.state!.market];
    s.selectHandCard(0);
    useGameStore.getState().tapCell(legalPlantCells(asState(s.state!), me, hand[0]!)[0]!);
    expect(useGameStore.getState().pendingPos).not.toBeNull();
    useGameStore.getState().confirmPlant();
    const after = useGameStore.getState();
    expect(after.state!.plants).toHaveLength(1);
    expect(after.state!.market).toEqual(market);
    expect(after.viewerId).toBe('p1');
    expect(after.state!.players.find((p) => p.id === 'p0')!.handCount).toBe(0);
  });

  it('손이 3장이면 가져올 수 없다', () => {
    let s = started();
    s = { ...s, players: s.players.map((p) => (p.id === 'p0' ? { ...p, hand: ['grass', 'oak', 'pine'] } : p)) };
    const h = engineHarness(s);
    expect(selectCanTake(useGameStore.getState())).toBe(false);
    useGameStore.getState().takeCard(0);
    expect(h.sent).toHaveLength(0);
  });

  it('거절된 행동은 안내 문구로 알린다', () => {
    toAct();
    useGameStore.getState().dispatch({ type: 'DISCARD', playerId: 'p0', species: useGameStore.getState().state!.players[0]!.hand[0]! });
    expect(useGameStore.getState().notice).toBeTruthy();
  });
});

describe('명당 부르기 (Rules.md 5.1 3)', () => {
  /** p0 의 칸 위에 명당이 하나 있는 상태 (p1 이 놓은 명당이어도 내 칸이면 부를 수 있다) */
  function withPlantOnMyLand(): GameState {
    const s = started();
    const owners = computeOwners(s);
    const c = owners.findIndex((o) => o === 0);
    const pos = { q: s.board!.cells[c]!.q, r: s.board!.cells[c]!.r };
    const plant: Plant = { id: 't0', species: 'grass', ownerId: 'p1', pos, rotation: 0 };
    return { ...s, plants: [plant] };
  }

  it('손 타일을 고르지 않은 채 내 칸 위 명당을 누르면 부르기 → 방향 → CALL (가져오기 없음)', () => {
    const s0 = withPlantOnMyLand();
    const h = engineHarness(s0);
    expect(selectCanCall(useGameStore.getState())).toBe(true);
    const pos = legalCallCells(s0, 'p0')[0]!;
    useGameStore.getState().tapCell(pos);
    expect(useGameStore.getState().callPos).toEqual(pos);
    expect(useGameStore.getState().callRotation).toBe(0);
    useGameStore.getState().setCallRotation(2);
    useGameStore.getState().confirmCall();
    expect(h.sent).toEqual([{ type: 'CALL', playerId: 'p0', pos, rotation: 2 }]);
    expect(h.get().log.some((e) => e.kind === 'call')).toBe(true);
    expect(h.get().plants[0]!.rotation).toBe(2);
    expect(h.get().currentPlayerId).toBe('p1');
  });

  it('같은 명당을 다시 누르면 부르기를 취소하고, 손 타일을 고르면 부르기 선택이 풀린다', () => {
    const s0 = withPlantOnMyLand();
    engineHarness(s0);
    const pos = legalCallCells(s0, 'p0')[0]!;
    useGameStore.getState().tapCell(pos);
    useGameStore.getState().tapCell(pos);
    expect(useGameStore.getState().callPos).toBeNull();
    useGameStore.getState().tapCell(pos);
    useGameStore.getState().selectHandCard(0);
    expect(useGameStore.getState().callPos).toBeNull();
    expect(useGameStore.getState().selectedHandIndex).toBe(0);
    expect(boardIndex(s0.board!).indexOf(pos)).toBeGreaterThanOrEqual(0);
  });
});
