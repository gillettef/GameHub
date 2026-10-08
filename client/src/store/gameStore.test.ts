import { describe, expect, it } from 'vitest';
import { legalPlantCells } from '@rootbound/shared';
import { asState } from '../game/derived';
import { selectNeedsTake, selectTake, useGameStore } from './gameStore';

const start = (players = 2) => {
  useGameStore.getState().reset();
  useGameStore.getState().startHotseat({ nicknames: Array.from({ length: players }, (_, i) => `P${i}`), seed: 3 });
  useGameStore.getState().acknowledgeHandoff();
};

describe('마켓 가져오기 선택 (Rules.md 5절)', () => {
  it('마켓이 2장 이상이면 고를 때까지 심기를 보내지 않고, 고르면 take 와 함께 심는다', () => {
    start(2);
    const s0 = useGameStore.getState();
    expect(s0.state!.market.length).toBeGreaterThan(1);
    expect(selectNeedsTake(s0)).toBe(true);
    const me = s0.viewerId!;
    const species = s0.state!.players.find((p) => p.id === me)!.hand[0]!;
    s0.selectHandCard(0);
    useGameStore.getState().tapCell(legalPlantCells(asState(s0.state!), me, species)[0]!);
    useGameStore.getState().confirmPlant();
    expect(useGameStore.getState().state!.plants).toHaveLength(0);
    expect(useGameStore.getState().notice).toContain('마켓');
    const taken = useGameStore.getState().state!.market[1]!;
    useGameStore.getState().pickTake(1);
    expect(selectTake(useGameStore.getState())).toBe(1);
    useGameStore.getState().confirmPlant();
    const after = useGameStore.getState().state!;
    expect(after.plants).toHaveLength(1);
    expect(after.players.find((p) => p.id === me)!.hand.at(-1)).toBe(taken);
    // 다음 사람 차례: 선택은 비워진다
    expect(useGameStore.getState().pendingTake).toBeNull();
  });

  it('마켓에 1장만 남으면 자동으로 그 카드를 가져올 카드로 본다', () => {
    start(2);
    const st = useGameStore.getState().state!;
    useGameStore.setState({ state: { ...st, market: st.market.slice(0, 1) } });
    expect(selectTake(useGameStore.getState())).toBe(0);
    expect(selectNeedsTake(useGameStore.getState())).toBe(false);
    useGameStore.setState({ state: { ...st, market: [] } });
    expect(selectTake(useGameStore.getState())).toBeNull();
    expect(selectNeedsTake(useGameStore.getState())).toBe(false);
  });

  it('손 카드를 바꿔도 고른 마켓 카드는 유지된다', () => {
    start(2);
    useGameStore.getState().pickTake(0);
    useGameStore.getState().selectHandCard(1);
    expect(useGameStore.getState().pendingTake).toBe(0);
  });
});
