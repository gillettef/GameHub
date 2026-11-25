import { LocalGame } from '@gamehub/net/client';
import { describe, expect, it } from 'vitest';
import { def, fromEngine, playerId, type Action } from '../../def';
import { legalPlantCells } from '../../engine';
import { asState } from '../game/derived';
import { selectCanPlant, selectCanTake, useGameStore } from './gameStore';

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

describe('이번 판 식물 공개 (Rules.md 4절 8)', () => {
  it('한 기기로는 공개 단계에서 시작하고, 확인 한 번으로 모두 확인되어 자리 0의 가져오기 차례가 된다', () => {
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
    expect(selectCanTake(s1)).toBe(true);
  });
});

describe('가져오기 → 심기 (Rules.md 5절)', () => {
  it('가져오기 차례에는 손 카드를 고를 수 없고, 마켓 카드를 가져오면 같은 사람이 이어서 심는다(기기를 넘기지 않는다)', () => {
    start(2);
    useGameStore.getState().confirmReveal();
    const s0 = useGameStore.getState();
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
  });

  it('심기 차례에는 take 없이 심고, 다음 사람 차례가 되면 기기 넘김 화면이 손패를 가린다', () => {
    start(2);
    useGameStore.getState().confirmReveal();
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
