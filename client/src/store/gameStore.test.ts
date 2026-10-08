import { describe, expect, it } from 'vitest';
import { legalPlantCells } from '@rootbound/shared';
import { asState } from '../game/derived';
import { selectCanPlant, selectCanTake, useGameStore } from './gameStore';

const start = (players = 2) => {
  useGameStore.getState().reset();
  useGameStore.getState().startHotseat({ nicknames: Array.from({ length: players }, (_, i) => `P${i}`), seed: 3 });
};

describe('이번 판 식물 공개 (Rules.md 4절 7)', () => {
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
  it('가져오기 차례에는 손 카드를 고를 수 없고, 마켓 카드를 가져오면 다음 사람에게 기기를 넘긴다', () => {
    start(2);
    useGameStore.getState().confirmReveal();
    const s0 = useGameStore.getState();
    s0.selectHandCard(0);
    expect(useGameStore.getState().selectedHandIndex).toBeNull();
    const taken = s0.state!.market[1]!;
    s0.takeCard(1);
    const s1 = useGameStore.getState();
    expect(s1.state!.players.find((p) => p.id === 'p0')!.hand.at(-1)).toBe(taken);
    expect(s1.viewerId).toBe('p1');
    expect(s1.handoffPending).toBe(true);
    s1.acknowledgeHandoff();
    useGameStore.getState().takeCard(0);
    // 모두 가져갔으니 선(자리 0)부터 심기
    const s2 = useGameStore.getState();
    expect(s2.state!.stage).toBe('plant');
    expect(s2.viewerId).toBe('p0');
    s2.acknowledgeHandoff();
    expect(selectCanPlant(useGameStore.getState())).toBe(true);
    expect(selectCanTake(useGameStore.getState())).toBe(false);
  });

  it('심기 차례에는 take 없이 심는다', () => {
    start(2);
    const st = useGameStore.getState();
    st.confirmReveal();
    useGameStore.getState().takeCard(0);
    useGameStore.getState().acknowledgeHandoff();
    useGameStore.getState().takeCard(0);
    useGameStore.getState().acknowledgeHandoff();
    const s = useGameStore.getState();
    const me = s.viewerId!;
    const hand = s.state!.players.find((p) => p.id === me)!.hand;
    expect(hand).toHaveLength(2);
    const index = hand.findIndex((sp) => legalPlantCells(asState(s.state!), me, sp).length > 0);
    s.selectHandCard(index);
    useGameStore.getState().tapCell(legalPlantCells(asState(s.state!), me, hand[index]!)[0]!);
    useGameStore.getState().confirmPlant();
    const after = useGameStore.getState().state!;
    expect(after.plants).toHaveLength(1);
    expect(after.players.find((p) => p.id === me)!.hand).toHaveLength(1);
  });
});
