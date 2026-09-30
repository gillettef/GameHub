import { describe, expect, it } from 'vitest';
import { legalCells } from '@astraltab/shared';
import { useGameStore } from '../store/gameStore';
import { buildPlacementPreview } from './derived';
import { createHotseatGame, hotseatPlayerId } from './hotseat';

const game = () =>
  createHotseatGame({
    mapId: 'binary-star',
    seed: 42,
    players: [
      { nickname: '갑', race: 'coalition' },
      { nickname: '을', race: 'coalition' },
    ],
  });

describe('배치 전 예상 전투 미리보기 (2026-09-30)', () => {
  it('상태를 바꾸지 않고 후보 칸 표시를 만든다', () => {
    const s = game();
    const me = hotseatPlayerId(0);
    const player = s.players.find((p) => p.id === me)!;
    const cardId = player.hand.find((c) => legalCells(s, me, c).length > 0)!;
    const pos = legalCells(s, me, cardId)[0]!;
    const before = JSON.stringify(s);
    const preview = buildPlacementPreview(s, me, cardId, pos);
    expect(JSON.stringify(s)).toBe(before);
    expect(preview.overlays.get(`${pos.x},${pos.y}`)?.candidate).toBe(true);
  });
});

describe('배치 후보 → 확정/취소 (클라이언트 보류)', () => {
  function start() {
    useGameStore.getState().reset();
    useGameStore.getState().startHotseat({
      mapId: 'binary-star',
      seed: 42,
      players: [
        { nickname: '갑', race: 'coalition' },
        { nickname: '을', race: 'coalition' },
      ],
    });
    useGameStore.getState().acknowledgeHandoff();
    const st = useGameStore.getState();
    const me = st.viewerId!;
    const hand = st.state!.players.find((p) => p.id === me)!.hand;
    const index = hand.findIndex((c) => legalCells(st.state as never, me, c).length > 0);
    st.selectHandCard(index);
    const cardId = hand[index]!;
    const pos = legalCells(st.state as never, me, cardId)[0]!;
    return { pos, me };
  }

  it('칸을 탭하면 놓지 않고 후보로만 보류한다', () => {
    const { pos } = start();
    const markersBefore = useGameStore.getState().state!.markers.length;
    useGameStore.getState().placeAt(pos.x, pos.y);
    const st = useGameStore.getState();
    expect(st.pendingPos).toEqual(pos);
    expect(st.state!.markers.length).toBe(markersBefore);
  });

  it('취소하면 아무것도 바뀌지 않고, 같은 후보를 다시 탭해도 거둔다', () => {
    const { pos } = start();
    useGameStore.getState().placeAt(pos.x, pos.y);
    useGameStore.getState().cancelPlacement();
    expect(useGameStore.getState().pendingPos).toBeNull();
    useGameStore.getState().placeAt(pos.x, pos.y);
    useGameStore.getState().placeAt(pos.x, pos.y);
    expect(useGameStore.getState().pendingPos).toBeNull();
  });

  it('확정하면 실제로 배치되고 후보·선택이 풀린다', () => {
    const { pos, me } = start();
    const markersBefore = useGameStore.getState().state!.markers.length;
    useGameStore.getState().placeAt(pos.x, pos.y);
    useGameStore.getState().confirmPlacement();
    const st = useGameStore.getState();
    expect(st.pendingPos).toBeNull();
    expect(st.selectedHandIndex).toBeNull();
    expect(st.state!.players.find((p) => p.id === me)!.actedThisTurn).toBe(true);
    expect(st.state!.markers.length).toBeGreaterThanOrEqual(markersBefore);
  });

  it('카드를 바꾸면 후보가 사라진다', () => {
    const { pos } = start();
    useGameStore.getState().placeAt(pos.x, pos.y);
    useGameStore.getState().selectHandCard(null);
    expect(useGameStore.getState().pendingPos).toBeNull();
  });
});
