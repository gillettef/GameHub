import { LocalGame } from '@gamehub/net/client';
import { describe, expect, it } from 'vitest';
import { def, fromEngine, playerId, type Action } from '../../def';
import type { ChoreId, Action as EngineAction, GameState } from '../../engine';
import { applyAction, autoAction, isPlaceChore, legalCallCells, legalMoveSources, legalMoveTargets, legalPlantCells, maskState, remainingChores } from '../../engine';
import { asState } from '../game/derived';
import { selectCanCall, selectCanMove, selectCanPickChore, selectCanPlant, selectCanTake, useGameStore } from './gameStore';

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

/** 기기 넘김 화면을 닫는다(돌려 하기) */
const ack = () => useGameStore.getState().acknowledgeHandoff();

/** 지금 일과 고르기 차례인 사람이 놓는 일과(없으면 남은 첫 일과)를 눌러 고르고 확인한다 */
function pickPlaceChore(): ChoreId {
  const s = useGameStore.getState();
  const left = remainingChores(s.state!);
  const chore = left.find((c) => isPlaceChore(c)) ?? left[0]!;
  s.pickChore(chore);
  useGameStore.getState().confirmChore();
  ack();
  return chore;
}

describe('이번 판 식물 공개 (Rules.md 4절 8)', () => {
  it('한 기기로는 공개 단계에서 시작하고, 확인 한 번으로 모두 확인되어 자리 0의 일과 고르기 차례가 된다', () => {
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
    expect(selectCanPickChore(s1)).toBe(true);
    expect(selectCanTake(s1)).toBe(false);
    expect(s1.state!.choreOffer).toHaveLength(4);
  });
});

describe('일과 고르기 (Rules.md 5.1)', () => {
  it('일과를 눌러도 바로 보내지 않고, 확인해야 보낸다. 다시 누르면 해제된다', () => {
    start(2);
    useGameStore.getState().confirmReveal();
    const chore = useGameStore.getState().state!.choreOffer[0]!;
    useGameStore.getState().pickChore(chore);
    expect(useGameStore.getState().pendingChore).toBe(chore);
    expect(useGameStore.getState().state!.chores[0]).toBeNull();
    useGameStore.getState().pickChore(chore);
    expect(useGameStore.getState().pendingChore).toBeNull();
    useGameStore.getState().pickChore(chore);
    useGameStore.getState().confirmChore();
    const s = useGameStore.getState();
    expect(s.state!.chores[0]).toBe(chore);
    expect(s.pendingChore).toBeNull();
    // 다음 사람이 고를 차례: 기기를 넘긴다
    expect(s.viewerId).toBe('p1');
    expect(s.handoffPending).toBe(true);
    ack();
    // 이미 고른 일과는 고를 수 없다
    useGameStore.getState().pickChore(chore);
    expect(useGameStore.getState().pendingChore).toBeNull();
    expect(useGameStore.getState().notice).toBeTruthy();
  });
});

describe('가져오기 → 심기 (Rules.md 5.2)', () => {
  /** 둘 다 놓는 일과를 고르고 자리 0의 가져오기 차례로 */
  function toTake() {
    start(2);
    useGameStore.getState().confirmReveal();
    pickPlaceChore();
    pickPlaceChore();
  }

  it('가져오기 차례에는 손 카드를 고를 수 없고, 마켓 카드를 가져오면 같은 사람이 이어서 심는다(기기를 넘기지 않는다)', () => {
    toTake();
    const s0 = useGameStore.getState();
    expect(s0.viewerId).toBe('p0');
    expect(selectCanTake(s0)).toBe(true);
    s0.selectHandCard(0);
    expect(useGameStore.getState().selectedHandIndex).toBeNull();
    const taken = s0.state!.market[1]!;
    s0.takeCard(1);
    const s1 = useGameStore.getState();
    expect(s1.state!.players.find((p) => p.id === 'p0')!.hand.at(-1)).toBe(taken);
    expect(s1.state!.stage).toBe('plant');
    expect(s1.viewerId).toBe('p0');
    expect(s1.handoffPending).toBe(false);
    expect(selectCanPlant(s1)).toBe(true);
    expect(selectCanTake(s1)).toBe(false);
    // 생선 냄새로 편 타일은 마켓을 가져가면 주머니로 돌아간다
    expect(s1.state!.peek).toBeNull();
  });

  it('심기 차례에는 take 없이 심고, 다음 사람 차례가 되면 기기 넘김 화면이 손패를 가린다', () => {
    toTake();
    useGameStore.getState().takeCard(0);
    const s = useGameStore.getState();
    const me = s.viewerId!;
    const hand = s.state!.players.find((p) => p.id === me)!.hand;
    expect(hand).toHaveLength(2);
    const index = hand.findIndex((sp) => legalPlantCells(asState(s.state!), me, sp).length > 0);
    s.selectHandCard(index);
    useGameStore.getState().tapCell(legalPlantCells(asState(s.state!), me, hand[index]!)[0]!);
    useGameStore.getState().confirmPlant();
    const after = useGameStore.getState();
    expect(after.state!.plants).toHaveLength(1);
    expect(after.viewerId).toBe('p1');
    expect(after.handoffPending).toBe(true);
    // 다음 사람에게는 자기 손만 보인다
    expect(after.state!.players.find((p) => p.id === 'p0')!.hand).toEqual([]);
    expect(after.state!.players.find((p) => p.id === 'p0')!.handCount).toBe(1);
  });

  it('거절된 행동은 안내 문구로 알린다', () => {
    start(2);
    useGameStore.getState().confirmReveal();
    useGameStore.getState().dispatch({ type: 'DISCARD', playerId: 'p0', species: useGameStore.getState().state!.players[0]!.hand[0]! });
    expect(useGameStore.getState().notice).toBeTruthy();
  });
});

/** 생선 냄새: 펼친 타일(state.peek)을 'peek' 로 가져온다 */
describe('생선 냄새 (Rules.md 5.3)', () => {
  it('펼친 타일을 가져오면 손에 들어가고 주머니 뒷면은 가져올 수 없다', () => {
    const h = engineHarness(engineToMyTurn('peek'));
    const s0 = h.get();
    expect(s0.stage).toBe('take');
    expect(s0.peek).not.toBeNull();
    const peek = s0.peek!;
    useGameStore.getState().takeCard('pile');
    expect(h.get().stage).toBe('take');
    expect(useGameStore.getState().notice).toBeTruthy();
    useGameStore.getState().takeCard('peek');
    expect(h.sent.at(-1)).toEqual({ type: 'TAKE', playerId: 'p0', take: 'peek' });
    expect(h.get().players[0]!.hand.at(-1)).toBe(peek);
    expect(h.get().stage).toBe('plant');
  });
});

/**
 * 엔진 상태를 직접 들고 도는 한 기기 판(담 넘기·명당 부르기처럼 특정 일과가 필요한 장면용). 보는 사람 = 차례인 사람
 */
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

/** 이미 시작한 판에서 p0 이 chore 일과로 차례를 맞을 때까지 진행한다. 상대는 다른 일과·자동 수.
 * 펼친 일과는 판마다 섞이므로, 원하는 일과가 없으면 테스트용으로 펼친 일과에 끼워 넣는다 */
function engineToMyTurnFrom(start: GameState, chore: ChoreId): GameState {
  let s = start;
  for (let i = 0; i < 400 && !(s.stage !== 'chore' && s.currentPlayerId === 'p0' && s.chores[0] === chore); i++) {
    if (s.stage === 'chore') {
      const want = s.currentPlayerId === 'p0' ? chore : s.choreOffer.find((c) => c !== chore && !s.chores.includes(c))!;
      if (!s.choreOffer.includes(want)) s = { ...s, choreOffer: [want, ...s.choreOffer] };
      s = applyAction(s, { type: 'PICK_CHORE', playerId: s.currentPlayerId!, chore: want }).state;
    } else s = applyAction(s, autoAction(s, s.currentPlayerId!)!).state;
  }
  return s;
}

/** 2인 판을 시작해(공개 단계 확인) p0 이 chore 일과로 차례를 맞을 때까지 진행한다. prefix 로 그 전에 판을 진행할 수 있다 */
function engineToMyTurn(chore: ChoreId, prefix?: (s: GameState) => GameState): GameState {
  let s = def.setup({ seats: [{ kind: 'human', name: 'P0' }, { kind: 'human', name: 'P1' }], seed: 11, options: { turnTime: null, tutorial: false } }).game;
  for (const p of s.players) s = applyAction(s, { type: 'CONFIRM', playerId: p.id }).state;
  return engineToMyTurnFrom(prefix ? prefix(s) : s, chore);
}

describe('담 넘기 (Rules.md 5.3)', () => {
  it('출발 칸 → 마릿수 → 도착 칸, 한 번 더 옮기기(첫 이동 뒤 보드 기준) → 이대로 끝내기로 MOVE 한 번에 보낸다', () => {
    const s0 = engineToMyTurn('move');
    expect(s0.stage).toBe('move');
    const h = engineHarness(s0);
    expect(selectCanMove(useGameStore.getState())).toBe(true);
    // 내 칸이 아닌 곳을 누르면 안내만
    const notMine = s0.board!.cells.find((c) => !legalMoveSources(s0, 'p0').some((p) => p.q === c.q && p.r === c.r))!;
    useGameStore.getState().tapCell(notMine);
    expect(useGameStore.getState().moveFrom).toBeNull();
    expect(useGameStore.getState().notice).toBeTruthy();
    // 첫 이동 (처음 고양이는 칸마다 1마리라 2마리는 고를 수 없다)
    const from = legalMoveSources(s0, 'p0')[0]!;
    const to = legalMoveTargets(s0, from)[0]!;
    useGameStore.getState().tapCell(from);
    expect(useGameStore.getState().moveFrom).toEqual(from);
    useGameStore.getState().setMoveCount(2);
    expect(useGameStore.getState().moveCount).toBe(1);
    useGameStore.getState().tapCell(to);
    expect(useGameStore.getState().moveTo).toEqual(to);
    useGameStore.getState().moveAgain();
    const st = useGameStore.getState();
    expect(st.moveSteps).toEqual([{ from, to, count: 1 }]);
    expect(st.moveFrom).toBeNull();
    expect(h.sent).toHaveLength(0);
    // 두 번째 이동: 첫 이동으로 고양이가 간 칸(to)에서도 옮길 수 있다(첫 이동 뒤 보드 기준)
    useGameStore.getState().tapCell(to);
    expect(useGameStore.getState().moveFrom).toEqual(to);
    const to2 = legalMoveTargets(s0, to).find((p) => p.q !== from.q || p.r !== from.r)!;
    useGameStore.getState().tapCell(to2);
    useGameStore.getState().confirmMove();
    expect(h.sent).toEqual([
      {
        type: 'MOVE',
        playerId: 'p0',
        moves: [
          { from, to, count: 1 },
          { from: to, to: to2, count: 1 },
        ],
      },
    ]);
    expect(h.get().log.filter((e) => e.kind === 'move')).toHaveLength(2);
    expect(useGameStore.getState().moveSteps).toEqual([]);
  });

  it('취소하면 정한 이동까지 처음부터 다시 고른다', () => {
    const h = engineHarness(engineToMyTurn('move'));
    const s0 = h.get();
    const from = legalMoveSources(s0, 'p0')[0]!;
    useGameStore.getState().tapCell(from);
    useGameStore.getState().tapCell(legalMoveTargets(s0, from)[0]!);
    useGameStore.getState().moveAgain();
    useGameStore.getState().cancelMove();
    const st = useGameStore.getState();
    expect(st.moveSteps).toEqual([]);
    expect(st.moveFrom).toBeNull();
    expect(h.sent).toHaveLength(0);
  });
});

describe('명당 부르기 (Rules.md 5.3)', () => {
  it('내 칸 위 명당 → 방향 → 가져올 펼친 타일(필수) → CALL', () => {
    // 1라운드에 p0 이 명당을 놓고 2라운드에 부른다
    const s0 = engineToMyTurn('call', (s) => {
      let t = engineToMyTurnFrom(s, 'bread');
      if (t.stage === 'take') t = applyAction(t, autoAction(t, 'p0')!).state;
      return applyAction(t, autoAction(t, 'p0')!).state;
    });
    expect(s0.stage).toBe('call');
    const h = engineHarness(s0);
    expect(selectCanCall(useGameStore.getState())).toBe(true);
    const pos = legalCallCells(s0, 'p0')[0]!;
    const plant = s0.plants.find((p) => p.pos.q === pos.q && p.pos.r === pos.r)!;
    useGameStore.getState().tapCell(pos);
    expect(useGameStore.getState().callPos).toEqual(pos);
    // 지금 방향에서 시작한다
    expect(useGameStore.getState().callRotation).toBe(plant.rotation);
    const rotation = ((plant.rotation + 1) % 6) as 0 | 1 | 2 | 3 | 4 | 5;
    useGameStore.getState().setCallRotation(rotation);
    // 가져올 타일을 안 고르면 보내지 않는다
    useGameStore.getState().confirmCall();
    expect(h.sent).toHaveLength(0);
    expect(useGameStore.getState().notice).toBeTruthy();
    useGameStore.getState().setCallTake(1);
    useGameStore.getState().confirmCall();
    expect(h.sent).toEqual([{ type: 'CALL', playerId: 'p0', pos, rotation, take: 1 }]);
    expect(h.get().log.some((e) => e.kind === 'call')).toBe(true);
  });
});
