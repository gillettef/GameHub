/**
 * 실험할 규칙 후보. base 를 복사해 바꿔 가며 비교한다.
 * 방향: D0(1,0) D1(1,-1) D2(0,-1) D3(-1,0) D4(-1,1) D5(0,1). 거리 2 직선 = D×2.
 */
import type { GoalDef, LabRules, SpeciesDef } from './engine.js';
import { ENTRANCE_TILE, TILE_LIBRARY, type TileSpec } from '../../src/data/tiles.js';
import { DIRECTIONS } from '../../src/engine/board.js';
import type { Terrain } from '../../src/types/index.js';
import { FERTILE, POND, ROCK } from './engine.js';

/** 방향 d 로 k 칸 떨어진 뿌리 칸에 큐브 v 개 */
export const at = (d: number, v: number, k = 1): [number, number, number] => [DIRECTIONS[d]![0] * k, DIRECTIONS[d]![1] * k, v];
const self = (v: number): [number, number, number] => [0, 0, v];

export const SPECIES_V2: SpeciesDef[] = [
  { id: 'grass', name: '잔디', pattern: [self(2), at(0, 1), at(1, 1), at(2, 1)] },
  { id: 'oak', name: '참나무', pattern: [self(2), at(0, 2), at(3, 2)], tags: ['tree'] },
  { id: 'pine', name: '소나무', pattern: [self(4), at(0, 1)], tags: ['tree'] },
  { id: 'kudzu', name: '칡', pattern: [self(1), at(0, 1), at(0, 2, 2)] },
  { id: 'fern', name: '고사리', pattern: [self(2), at(0, 1, 2), at(2, 1, 2), at(4, 1, 2)] },
  { id: 'dandelion', name: '민들레', pattern: [self(1), at(0, 1)], ability: { kind: 'seed', value: 2, range: 2, count: 1 }, tags: ['flower'] },
  { id: 'rapeseed', name: '유채', pattern: [self(2), at(0, 1), at(3, 1)], ability: { kind: 'fertileRing', value: 1 }, tags: ['flower'] },
  { id: 'lotus', name: '연꽃', pattern: [self(2), at(0, 1), at(3, 1)], ability: { kind: 'pond' }, tags: ['flower'] },
  { id: 'ivy', name: '담쟁이', pattern: [self(1), at(0, 1)], ability: { kind: 'ivy', value: 1 } },
  { id: 'bamboo', name: '대나무', pattern: [self(1), at(0, 1), at(1, 1)], ability: { kind: 'cluster', value: 1 }, tags: ['tree'] },
  { id: 'mushroom', name: '버섯', pattern: [self(2)], ability: { kind: 'wither', value: 1 } },
  { id: 'mugunghwa', name: '무궁화', pattern: [self(2), at(0, 1), at(1, 1)], ability: { kind: 'bloom', value: 2 }, tags: ['flower'] },
];

export const GOALS_V2: GoalDef[] = [
  { id: 'big-garden', kind: 'big-garden', a: 6, b: 3 },
  { id: 'pond-side', kind: 'pond-side', a: 1 },
  { id: 'fertile-field', kind: 'fertile-field', a: 2 },
  { id: 'edge-fence', kind: 'edge-fence', a: 1 },
  { id: 'center-plaza', kind: 'center-plaza', a: 6, b: 0 },
  { id: 'every-tile', kind: 'every-tile', a: 1 },
  { id: 'flower-bed', kind: 'flower-bed', a: 2 },
  { id: 'forest', kind: 'forest', a: 4, b: 3 },
  { id: 'variety', kind: 'variety', a: 4, b: 5 },
  { id: 'long-path', kind: 'long-path', a: 5, b: 2 },
  { id: 'pine-reserve', kind: 'reserve', species: 'pine', a: 2 },
  { id: 'kudzu-reserve', kind: 'reserve', species: 'kudzu', a: 2 },
  { id: 'fern-reserve', kind: 'reserve', species: 'fern', a: 2 },
  { id: 'grass-reserve', kind: 'reserve', species: 'grass', a: 2 },
  { id: 'mushroom-reserve', kind: 'reserve', species: 'mushroom', a: 2 },
  { id: 'dandelion-reserve', kind: 'reserve', species: 'dandelion', a: 2 },
];

/** 정본 정원 조각(shared/src/data/tiles.ts)을 실험실 지형 번호로 옮긴 것. 정본을 바꾸면 실험실도 따라간다 */
const LAB_TERRAIN: Record<Terrain, number> = { empty: 0, pond: POND, rock: ROCK, fertile: FERTILE };
const toLab = (tile: TileSpec): [number, number][] => tile.map(([k, t]) => [k, LAB_TERRAIN[t]]);
export const TILES_V1: [number, number][][] = TILE_LIBRARY.map(toLab);

export const BASE: LabRules = {
  name: 'v2-base',
  mode: 'tug',
  cap: 0,
  species: SPECIES_V2,
  gardenSize: { 2: 6, 3: 6, 4: 8 },
  copies: { 2: 4, 3: 5, 4: 5 },
  market: { 2: 3, 3: 4, 4: 5 },
  startHand: 1,
  flow: 'turn',
  firstPlayer: 'fixed',
  plantOn: 'own',
  entranceRing: 1,
  fertileBonus: 1,
  rotate: true,
  goals: GOALS_V2,
  goalCount: 3,
  requireReserve: true,
  komi: { 2: [0, 0], 3: [0, 0, 0], 4: [0, 0, 0, 0] },
  tiles: TILES_V1,
  entranceTile: toLab(ENTRANCE_TILE),
  noCell: 'entrance',
  refill: 'refill',
};

export function variant(name: string, patch: Partial<LabRules>, from: LabRules = BASE): LabRules {
  return { ...from, ...patch, name };
}

export function patchSpecies(list: SpeciesDef[], patch: Record<string, Partial<SpeciesDef>>): SpeciesDef[] {
  return list.map((s) => (patch[s.id] ? { ...s, ...patch[s.id] } : s));
}
