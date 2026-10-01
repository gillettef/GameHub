import { describe, expect, it } from 'vitest';
import type { CellView, MarkerView } from './derived';
import { diffMarkerEffects, snapshotMarkers } from './derived';

function marker(overrides: Partial<MarkerView> & { id: string; hp: number; seat: number }): MarkerView {
  return {
    specId: 'placeholder' as MarkerView['specId'],
    name: '테스트',
    kind: 'unit',
    ownerName: '테스터',
    maxHp: 10,
    attack: 0,
    range: 0,
    sight: 1,
    score: 1,
    production: 0,
    remainingTurns: null,
    ...overrides,
  };
}

function cell(x: number, y: number, m: MarkerView | null): CellView {
  return {
    x,
    y,
    key: `${x},${y}`,
    terrain: 'empty' as CellView['terrain'],
    ownerSeat: null,
    inSight: true,
    marker: m,
  };
}

describe('snapshotMarkers', () => {
  it('마커가 없는 칸은 스냅샷에서 제외한다', () => {
    const cells = [cell(0, 0, null), cell(1, 0, marker({ id: 'a', hp: 3, seat: 0 }))];
    const snap = snapshotMarkers(cells);
    expect(snap.size).toBe(1);
    expect(snap.get('1,0')).toEqual({ id: 'a', hp: 3, seat: 0 });
  });
});

describe('diffMarkerEffects (배치·전투·파괴 시각 피드백, 2026-09-28 / 배치 2026-10-01)', () => {
  it('같은 칸에서 id 가 사라지면 파괴 이펙트를 낸다', () => {
    const prev = snapshotMarkers([cell(2, 2, marker({ id: 'core-0', hp: 5, seat: 1 }))]);
    const next = snapshotMarkers([cell(2, 2, null)]);
    expect(diffMarkerEffects(prev, next)).toEqual([{ id: '2,2:destroy:core-0', cellKey: '2,2', type: 'destroy', seat: 1 }]);
  });

  it('같은 마커의 hp 가 줄면 피격 이펙트를 낸다', () => {
    const prev = snapshotMarkers([cell(3, 1, marker({ id: 'u-1', hp: 4, seat: 2 }))]);
    const next = snapshotMarkers([cell(3, 1, marker({ id: 'u-1', hp: 2, seat: 2 }))]);
    expect(diffMarkerEffects(prev, next)).toEqual([{ id: '3,1:hit:u-1:2', cellKey: '3,1', type: 'hit', seat: 2, amount: 2 }]);
  });

  it('hp 가 그대로면 이펙트가 없다', () => {
    const prev = snapshotMarkers([cell(0, 0, marker({ id: 'u-1', hp: 4, seat: 0 }))]);
    const next = snapshotMarkers([cell(0, 0, marker({ id: 'u-1', hp: 4, seat: 0 }))]);
    expect(diffMarkerEffects(prev, next)).toEqual([]);
  });

  it('빈 칸에 새 마커가 등장하면(배치) 배치 이펙트만 낸다', () => {
    const prev = snapshotMarkers([cell(0, 0, null)]);
    const next = snapshotMarkers([cell(0, 0, marker({ id: 'new-1', hp: 3, seat: 0 }))]);
    expect(diffMarkerEffects(prev, next)).toEqual([{ id: '0,0:place:new-1', cellKey: '0,0', type: 'place', seat: 0 }]);
  });

  it('파괴 후 같은 칸에 다른 마커가 새로 놓이면 파괴와 배치를 둘 다 기록한다', () => {
    const prev = snapshotMarkers([cell(5, 5, marker({ id: 'old', hp: 1, seat: 0 }))]);
    const next = snapshotMarkers([cell(5, 5, marker({ id: 'new', hp: 3, seat: 1 }))]);
    expect(diffMarkerEffects(prev, next)).toEqual([
      { id: '5,5:destroy:old', cellKey: '5,5', type: 'destroy', seat: 0 },
      { id: '5,5:place:new', cellKey: '5,5', type: 'place', seat: 1 },
    ]);
  });
});
