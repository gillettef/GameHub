import { describe, expect, it } from 'vitest';
import { DEFAULT_DECK_CHOICE, INITIAL_HAND_SIZE, STARTING_ENERGY, getMap, legalCells } from '@astraltab/shared';
import { buildCells, buildHand, buildPlayerSummaries, legalCellKeys } from './derived';
import { applyHotseatAction, createHotseatGame, hotseatPlayerId } from './hotseat';

const twoPlayers = () =>
  createHotseatGame({
    mapId: 'binary-star',
    seed: 42,
    players: [
      { nickname: '갑', deckChoice: DEFAULT_DECK_CHOICE },
      { nickname: '', deckChoice: { buildingId: 'observatory', unitId: 'stealth', magicId: 'energy-storm' } },
    ],
  });

describe('핫시트 어댑터', () => {
  it('맵 정원만큼 앉히고 첫 턴 시작 단계까지 진행한다 (F018, F019)', () => {
    const s = twoPlayers();
    expect(s.phase).toBe('playing');
    expect(s.players.map((p) => p.nickname)).toEqual(['갑', '플레이어 2']);
    expect(s.currentPlayerId).toBe(hotseatPlayerId(0));
    expect(s.markers.filter((m) => m.kind === 'core')).toHaveLength(2);
    // 첫 플레이어는 수입 +1, 드로우 +1 을 이미 받았다
    const first = s.players[0]!;
    expect(first.energy).toBe(STARTING_ENERGY + 1);
    expect(first.hand).toHaveLength(INITIAL_HAND_SIZE + 1);
    const second = s.players[1]!;
    expect(second.energy).toBe(STARTING_ENERGY);
    expect(second.hand).toHaveLength(INITIAL_HAND_SIZE);
  });

  it('정원이 맞지 않으면 시작하지 않는다', () => {
    expect(() =>
      createHotseatGame({ mapId: 'binary-star', seed: 1, players: [{ nickname: 'a', deckChoice: DEFAULT_DECK_CHOICE }] }),
    ).toThrow(/2명/);
  });

  it('같은 시드는 같은 손패를 준다 (F019)', () => {
    const a = twoPlayers();
    const b = twoPlayers();
    expect(a.players.map((p) => p.hand)).toEqual(b.players.map((p) => p.hand));
    expect(a.players.map((p) => p.deck)).toEqual(b.players.map((p) => p.deck));
  });

  it('배치 → 턴 전환, 패스 → 턴 전환, 거부 시 상태 유지 (F009, F013, F022)', () => {
    const s0 = twoPlayers();
    const p0 = hotseatPlayerId(0);
    const p1 = hotseatPlayerId(1);

    // 상대 턴에 보낸 액션은 거부되고 상태가 그대로다
    const wrong = applyHotseatAction(s0, { type: 'PASS', playerId: p1 });
    expect(wrong.error).toMatch(/턴입니다/);
    expect(wrong.state).toBe(s0);

    // 낼 수 있는 카드 하나를 골라 합법 칸에 놓는다
    const hand = buildHand(s0, p0);
    const playable = hand.find((c) => c.playable);
    expect(playable).toBeDefined();
    const cell = legalCells(s0, p0, playable!.cardId)[0]!;
    const placed = applyHotseatAction(s0, { type: 'PLACE', playerId: p0, cardId: playable!.cardId, pos: cell });
    expect(placed.error).toBeUndefined();
    expect(placed.state.currentPlayerId).toBe(p1);
    expect(placed.state.turn).toBe(2);
    expect(placed.state.markers.some((m) => m.pos.x === cell.x && m.pos.y === cell.y)).toBe(true);

    // 다음 플레이어가 패스하면 다시 첫 플레이어 턴, 라운드 2
    const passed = applyHotseatAction(placed.state, { type: 'PASS', playerId: p1 });
    expect(passed.error).toBeUndefined();
    expect(passed.state.currentPlayerId).toBe(p0);
    expect(passed.state.round).toBe(2);
  });

  it('기권하면 즉시 종료되고 결과가 생긴다 (F024)', () => {
    const s0 = twoPlayers();
    const r = applyHotseatAction(s0, { type: 'SURRENDER', playerId: hotseatPlayerId(0) });
    expect(r.error).toBeUndefined();
    expect(r.state.phase).toBe('finished');
    expect(r.state.result?.reason).toBe('last-survivor');
    expect(r.state.result?.ranking[0]).toBe(hotseatPlayerId(1));
  });

  it('전원 패스로 끝까지 둘 수 있다 (F025)', () => {
    let s = twoPlayers();
    let guard = 0;
    while (s.phase === 'playing' && guard++ < 10) {
      const r = applyHotseatAction(s, { type: 'PASS', playerId: s.currentPlayerId! });
      expect(r.error).toBeUndefined();
      s = r.state;
    }
    expect(s.phase).toBe('finished');
    expect(s.result?.reason).toBe('all-pass');
  });
});

describe('화면 파생값', () => {
  it('셀 수는 맵 크기와 같고 y → x 순이며 코어 칸은 소유자 영토다 (F008, F031)', () => {
    const s = twoPlayers();
    const map = getMap(s.mapId);
    const cells = buildCells(s, hotseatPlayerId(0));
    expect(cells).toHaveLength(map.size * map.size);
    expect(cells[1]).toMatchObject({ x: 1, y: 0 });
    expect(cells[map.size]).toMatchObject({ x: 0, y: 1 });
    const core0 = map.corePositions[0]!;
    const coreCell = cells[core0.y * map.size + core0.x]!;
    expect(coreCell.marker?.kind).toBe('core');
    expect(coreCell.ownerSeat).toBe(0);
    expect(coreCell.inSight).toBe(true);
    const vein = cells.find((c) => c.terrain === 'vein');
    expect(vein).toBeDefined();
  });

  it('선택 카드의 배치 가능 칸은 엔진의 legalCells 와 같다 (F009)', () => {
    const s = twoPlayers();
    const p0 = hotseatPlayerId(0);
    const card = buildHand(s, p0).find((c) => c.playable)!;
    const keys = legalCellKeys(s, p0, card.cardId);
    const expected = legalCells(s, p0, card.cardId);
    expect(keys.size).toBe(expected.length);
    for (const p of expected) expect(keys.has(`${p.x},${p.y}`)).toBe(true);
    // 카드가 없거나 상대 턴이면 빈 집합
    expect(legalCellKeys(s, p0, null).size).toBe(0);
    expect(legalCellKeys(s, hotseatPlayerId(1), card.cardId).size).toBe(0);
  });

  it('손패는 비용 부족·상대 턴 사유를 엔진 메시지로 표시한다 (F009, F011)', () => {
    const s = twoPlayers();
    const p0 = hotseatPlayerId(0);
    const mine = buildHand(s, p0);
    const expensive = mine.find((c) => c.cost > s.players[0]!.energy);
    if (expensive) expect(expensive.reason).toMatch(/에너지가 \d+ 부족합니다/);
    const theirs = buildHand(s, hotseatPlayerId(1));
    expect(theirs.every((c) => !c.playable && /턴입니다/.test(c.reason ?? ''))).toBe(true);
  });

  it('플레이어 요약은 좌석 순이고 점수가 영토·마커로 나뉜다 (F010)', () => {
    const s = twoPlayers();
    const rows = buildPlayerSummaries(s);
    expect(rows.map((r) => r.seat)).toEqual([0, 1]);
    for (const r of rows) {
      expect(r.total).toBe(r.territory + r.markerScore);
      expect(r.income).toBe(1);
      expect(r.markerCount).toBe(1);
      expect(r.deckCount + r.handCount + r.discardCount).toBe(23);
    }
    expect(rows[0]!.isCurrent).toBe(true);
  });
});
