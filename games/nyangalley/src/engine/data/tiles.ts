/**
 * 정원 조각 (Rules.md 3.2절). 칸 번호 0 = 가운데, 1~6 = 방향 0~5 쪽 둘레.
 */
import type { Terrain } from '../types.js';

export type TileSpec = readonly (readonly [slot: number, terrain: Terrain])[];

/** 일반 조각 12장. 연못·돌밭 합 12칸 → 조각당 평균 1칸이 막힌다 */
export const TILE_LIBRARY: readonly TileSpec[] = [
  [[1, 'pond']],
  [
    [1, 'pond'],
    [2, 'pond'],
  ],
  [[1, 'rock']],
  [[0, 'pond']],
  [[1, 'fertile']],
  [
    [1, 'fertile'],
    [4, 'fertile'],
  ],
  [
    [1, 'pond'],
    [4, 'fertile'],
  ],
  [
    [1, 'rock'],
    [3, 'fertile'],
  ],
  [
    [1, 'pond'],
    [2, 'pond'],
    [5, 'fertile'],
  ],
  [
    [0, 'fertile'],
    [3, 'rock'],
  ],
  [
    [2, 'pond'],
    [5, 'rock'],
  ],
  [],
];

/** 입구 조각: 가운데가 입구, 둘레 1번 칸이 비옥토 */
export const ENTRANCE_TILE: TileSpec = [[1, 'fertile']];
