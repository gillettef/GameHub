import { LocalGame } from '@gamehub/net/client';
import { describe, expect, it } from 'vitest';
import { def, fromEngine, playerId, type Action } from '../../def';
import type { Action as EngineAction, GameState, Plant } from '../../engine';
import { applyAction, boardIndex, computeOwners, legalCallCells, legalPlantCells, maskState } from '../../engine';
import { asState } from '../game/derived';
import { selectCanAct, selectCanCall, selectCanPlant, selectCanTake, selectChoosingAct, selectTakingSecond, useGameStore } from './gameStore';

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
    // 한 기기도 행동 하나씩 보낸다(공개 단계는 사람마다 확인, App 의 LocalTable 과 같다)
    game.act(fromEngine(a, useGameStore.getState().state!.turn) as Action);
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

/** 한 기기 공개 단계: 사람마다 차례로 확인한다 */
function confirmAll() {
  for (let k = 0; k < 4 && useGameStore.getState().state!.phase === 'reveal'; k++) useGameStore.getState().confirmReveal();
}

describe('이번 판 식물 공개 · 무리 고르기 (Rules.md 4절 8)', () => {
  it('한 기기로는 사람마다 무리를 고르고 확인한다. 남이 고른 무리는 거절되고, 랜덤은 시작할 때 남은 무리로 정해진다', () => {
    start(3);
    const s0 = useGameStore.getState();
    expect(s0.state!.phase).toBe('reveal');
    expect(s0.viewerId).toBe('p0');
    s0.pickCrew(2);
    expect(useGameStore.getState().state!.players[0]!.crew).toBe(2);
    useGameStore.getState().confirmReveal();
    // 다음 사람이 본다. 이미 고른 무리는 고를 수 없다
    expect(useGameStore.getState().viewerId).toBe('p1');
    useGameStore.getState().pickCrew(2);
    expect(useGameStore.getState().notice).toBeTruthy();
    useGameStore.getState().pickCrew(3);
    useGameStore.getState().confirmReveal();
    expect(useGameStore.getState().viewerId).toBe('p2');
    useGameStore.getState().confirmReveal();
    const s1 = useGameStore.getState();
    expect(s1.state!.phase).toBe('playing');
    const crews = s1.state!.players.map((p) => p.crew);
    expect(crews.slice(0, 2)).toEqual([2, 3]);
    expect([0, 1]).toContain(crews[2]);
    // 1라운드가 열릴 때 보는 사람이 바뀌면(마지막 확인자 → 자리 0) 가림 화면
    expect(s1.viewerId).toBe('p0');
    expect(s1.handoffPending).toBe(true);
  });
});

describe('행동 고르기 → 행동별 화면 (Rules.md 5.1)', () => {
  it('내 차례가 되면 먼저 행동을 고른다. 고르기 전에는 가져오기·놓기를 못 하고, 다른 행동으로 돌아갈 수 있다', () => {
    start(2);
    confirmAll();
    useGameStore.getState().acknowledgeHandoff();
    const s1 = useGameStore.getState();
    expect(s1.state!.stage).toBe('act');
    expect(selectCanAct(s1)).toBe(true);
    expect(selectChoosingAct(s1)).toBe(true);
    expect(selectCanTake(s1)).toBe(false);
    expect(selectCanPlant(s1)).toBe(false);
    s1.chooseAct('take');
    expect(selectCanTake(useGameStore.getState())).toBe(true);
    expect(selectCanPlant(useGameStore.getState())).toBe(false);
    useGameStore.getState().chooseAct(null);
    expect(selectChoosingAct(useGameStore.getState())).toBe(true);
    useGameStore.getState().chooseAct('plant');
    expect(selectCanPlant(useGameStore.getState())).toBe(true);
    expect(selectCanTake(useGameStore.getState())).toBe(false);
  });
});

describe('행동 하나 (Rules.md 5.1)', () => {
  function toAct() {
    start(2);
    confirmAll();
    useGameStore.getState().acknowledgeHandoff();
  }

  it('가져오기: 펼친 타일이면 1장으로 차례 끝, 주머니면 같은 사람이 주머니에서 두 번째를 가져온다(놓기는 못 함)', () => {
    toAct();
    useGameStore.getState().chooseAct('take');
    const m0 = useGameStore.getState();
    const picked = m0.state!.market[1]!;
    m0.takeCard(1);
    expect(useGameStore.getState().state!.players.find((p) => p.id === 'p0')!.handCount).toBe(2);
    expect(useGameStore.getState().state!.players[0]!.hand).toEqual([]);
    expect(useGameStore.getState().viewerId).toBe('p1');
    expect(picked).toBeTruthy();
    // 다음 사람(p1): 주머니에서 두 장
    useGameStore.getState().acknowledgeHandoff();
    useGameStore.getState().chooseAct('take');
    const s0 = useGameStore.getState();
    const before = s0.state!.players.find((p) => p.id === 'p1')!.hand.length;
    s0.takeCard('pile');
    const s1 = useGameStore.getState();
    expect(s1.state!.players.find((p) => p.id === 'p1')!.hand).toHaveLength(before + 1);
    expect(s1.state!.stage).toBe('take');
    expect(s1.viewerId).toBe('p1');
    expect(s1.handoffPending).toBe(false);
    expect(selectTakingSecond(s1)).toBe(true);
    expect(selectCanTake(s1)).toBe(true);
    expect(selectCanPlant(s1)).toBe(false);
    s1.selectHandCard(0);
    expect(useGameStore.getState().selectedHandIndex).toBeNull();
    // 두 번째 장은 주머니에서만(펼친 타일은 거절)
    useGameStore.getState().takeCard(0);
    expect(useGameStore.getState().notice).toMatch(/주머니/);
    useGameStore.getState().takeCard('pile');
    const s2 = useGameStore.getState();
    // 차례가 끝났다(라운드가 바뀌어 같은 사람이 다음 선일 수도 있다)
    expect(s2.state!.stage).toBe('act');
    expect(s2.state!.turn).toBeGreaterThan(s1.state!.turn);
    expect(s2.state!.players.find((p) => p.id === 'p1')!.handCount).toBe(before + 2);
  });

  it('놓기: 내 타일을 고르고 칸을 눌러 미리 본 뒤 놓으면 가져오지 않고 다음 사람 차례가 된다', () => {
    toAct();
    useGameStore.getState().chooseAct('plant');
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
    useGameStore.getState().chooseAct('take');
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

  it('부르기를 고르고 내 칸 위 명당을 누르면 부르기 → 방향 → CALL (가져오기 없음)', () => {
    const s0 = withPlantOnMyLand();
    const h = engineHarness(s0);
    expect(selectCanCall(useGameStore.getState())).toBe(false);
    useGameStore.getState().chooseAct('call');
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

  it('같은 명당을 다시 누르면 부르기를 취소하고, 다른 행동으로 돌아가면 고른 명당이 풀린다', () => {
    const s0 = withPlantOnMyLand();
    engineHarness(s0);
    useGameStore.getState().chooseAct('call');
    const pos = legalCallCells(s0, 'p0')[0]!;
    useGameStore.getState().tapCell(pos);
    useGameStore.getState().tapCell(pos);
    expect(useGameStore.getState().callPos).toBeNull();
    useGameStore.getState().tapCell(pos);
    useGameStore.getState().chooseAct('plant');
    expect(useGameStore.getState().callPos).toBeNull();
    useGameStore.getState().selectHandCard(0);
    expect(useGameStore.getState().selectedHandIndex).toBe(0);
    expect(boardIndex(s0.board!).indexOf(pos)).toBeGreaterThanOrEqual(0);
  });
});
