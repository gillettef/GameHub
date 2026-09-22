/**
 * 카드·유닛·건물 기준표와 초기 세팅 상수 (초안, 밸런스는 플레이테스트 후 조정).
 * 값을 바꾸면 ai/astral_ai 의 시뮬레이션과 shared/fixtures 도 함께 맞춘다.
 */
import type { BuildingSpec, CardRef, DeckChoice, MagicSpec, UnitSpec } from '../types/index.js';

// ---------------------------------------------------------------------------
// 보드 · 턴 · 초기값
// ---------------------------------------------------------------------------

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 10;

/** 게임 시작 시 플레이어별 초기 자원·마나 (F019) */
export const INITIAL_RESOURCES = 10;
export const INITIAL_MANA = 5;

/** 시작 손패 수, 턴마다 뽑는 수 */
export const INITIAL_HAND_SIZE = 5;
export const DRAW_PER_TURN = 1;

/** 제한 턴. 도달 시 점수 정산 (F025). 모든 플레이어가 한 번씩 진행하면 1턴 */
export const TURN_LIMIT = 30;

/** 최소·최대 인원 */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/** 영토 판정: 자기 건물로부터 이 거리(체비쇼프) 이내의 칸 */
export const TERRITORY_RADIUS = 1;
/** 점수 가중치 (F025) */
export const SCORE_PER_TERRITORY_CELL = 1;

/** 유닛·건물 배치 가능 거리: 자기 건물로부터 이 거리 이내 */
export const PLACEMENT_RADIUS = 1;

/** 플레이어 수별 메인 기지 자동 배치 위치 (F018). 10×10 기준 대칭 */
export const MAIN_BASE_POSITIONS: Record<number, ReadonlyArray<{ x: number; y: number }>> = {
  2: [
    { x: 1, y: 1 },
    { x: 8, y: 8 },
  ],
  3: [
    { x: 1, y: 1 },
    { x: 8, y: 1 },
    { x: 4, y: 8 },
  ],
  4: [
    { x: 1, y: 1 },
    { x: 8, y: 8 },
    { x: 8, y: 1 },
    { x: 1, y: 8 },
  ],
};

// ---------------------------------------------------------------------------
// 건물
// ---------------------------------------------------------------------------

export const BUILDINGS: readonly BuildingSpec[] = [
  {
    id: 'main-base',
    name: '메인 기지',
    kind: 'main-base',
    special: false,
    cost: { resources: 0, mana: 0 },
    hp: 20,
    defense: 2,
    production: { resources: 1, mana: 1 },
    score: 0,
    description: '파괴되면 즉시 패배한다. 매 턴 자원 1, 마나 1을 생산한다.',
  },
  {
    id: 'mine',
    name: '채굴 기지',
    kind: 'resource',
    special: false,
    cost: { resources: 3, mana: 0 },
    hp: 6,
    defense: 0,
    production: { resources: 2, mana: 0 },
    score: 1,
    description: '매 턴 자원 2를 생산한다.',
  },
  {
    id: 'mana-well',
    name: '마나 우물',
    kind: 'mana',
    special: false,
    cost: { resources: 3, mana: 0 },
    hp: 6,
    defense: 0,
    production: { resources: 0, mana: 1 },
    score: 1,
    description: '매 턴 마나 1을 생산한다.',
  },
  {
    id: 'outpost',
    name: '전초 기지',
    kind: 'defense',
    special: false,
    cost: { resources: 4, mana: 0 },
    hp: 8,
    defense: 1,
    production: { resources: 0, mana: 0 },
    score: 2,
    description: '생산은 없지만 영토를 넓히고 건물 점수 2를 준다.',
  },
  // 특수 건물 (덱 빌딩에서 1장 선택)
  {
    id: 'orbital-forge',
    name: '궤도 제련소',
    kind: 'resource',
    special: true,
    cost: { resources: 6, mana: 0 },
    hp: 8,
    defense: 1,
    production: { resources: 4, mana: 0 },
    score: 2,
    description: '매 턴 자원 4를 생산하는 고효율 채굴 시설.',
  },
  {
    id: 'nexus',
    name: '성운 넥서스',
    kind: 'mana',
    special: true,
    cost: { resources: 5, mana: 0 },
    hp: 7,
    defense: 1,
    production: { resources: 0, mana: 3 },
    score: 2,
    description: '매 턴 마나 3을 생산한다.',
  },
  {
    id: 'bastion',
    name: '성채',
    kind: 'defense',
    special: true,
    cost: { resources: 6, mana: 0 },
    hp: 15,
    defense: 3,
    production: { resources: 0, mana: 0 },
    score: 4,
    description: '매우 단단한 방어 시설. 건물 점수 4.',
  },
];

// ---------------------------------------------------------------------------
// 유닛
// ---------------------------------------------------------------------------

export const UNITS: readonly UnitSpec[] = [
  {
    id: 'scout',
    name: '정찰선',
    special: false,
    cost: { resources: 2, mana: 0 },
    hp: 3,
    attack: 1,
    defense: 0,
    moveRange: 3,
    attackRange: 1,
    description: '빠르지만 약하다. 영토 확장과 견제용.',
  },
  {
    id: 'soldier',
    name: '전투함',
    special: false,
    cost: { resources: 3, mana: 0 },
    hp: 5,
    attack: 2,
    defense: 1,
    moveRange: 2,
    attackRange: 1,
    description: '기본 전투 유닛.',
  },
  {
    id: 'tank',
    name: '중순양함',
    special: false,
    cost: { resources: 5, mana: 1 },
    hp: 9,
    attack: 3,
    defense: 2,
    moveRange: 1,
    attackRange: 1,
    description: '느리지만 단단하다. 기지 공략의 핵심.',
  },
  // 특수 유닛 (덱 빌딩에서 1장 선택)
  {
    id: 'titan',
    name: '타이탄',
    special: true,
    cost: { resources: 10, mana: 3 },
    hp: 15,
    attack: 6,
    defense: 3,
    moveRange: 1,
    attackRange: 1,
    description: '자원을 모아 배치하는 결전 병기. 기지 파괴의 열쇠.',
  },
  {
    id: 'phantom',
    name: '팬텀',
    special: true,
    cost: { resources: 5, mana: 2 },
    hp: 4,
    attack: 4,
    defense: 0,
    moveRange: 4,
    attackRange: 1,
    description: '한 턴에 4칸 이동하는 기습 유닛.',
  },
  {
    id: 'warden',
    name: '워든',
    special: true,
    cost: { resources: 6, mana: 2 },
    hp: 10,
    attack: 2,
    defense: 4,
    moveRange: 1,
    attackRange: 2,
    description: '사거리 2의 방어 유닛. 기지 수비에 적합.',
  },
];

// ---------------------------------------------------------------------------
// 마법
// ---------------------------------------------------------------------------

export const MAGICS: readonly MagicSpec[] = [
  {
    id: 'bolt',
    name: '플라즈마 볼트',
    special: false,
    cost: { resources: 0, mana: 2 },
    effect: { type: 'damage', amount: 3, radius: 0 },
    description: '대상 하나에 피해 3.',
  },
  {
    id: 'repair',
    name: '나노 수리',
    special: false,
    cost: { resources: 0, mana: 2 },
    effect: { type: 'heal', amount: 4 },
    description: '아군 유닛 또는 건물의 체력 4 회복.',
  },
  {
    id: 'harvest',
    name: '소행성 채집',
    special: false,
    cost: { resources: 0, mana: 1 },
    effect: { type: 'gain', resources: 3, mana: 0 },
    description: '즉시 자원 3 획득.',
  },
  // 특수 마법 (덱 빌딩에서 1장 선택)
  {
    id: 'supernova',
    name: '초신성',
    special: true,
    cost: { resources: 0, mana: 5 },
    effect: { type: 'damage', amount: 5, radius: 1 },
    description: '대상 칸과 주변 1칸의 모든 개체에 피해 5.',
  },
  {
    id: 'rally',
    name: '전군 돌격',
    special: true,
    cost: { resources: 0, mana: 3 },
    effect: { type: 'buff-attack', amount: 2, durationTurns: 1 },
    description: '이번 턴 모든 아군 유닛 공격력 +2.',
  },
  {
    id: 'siphon',
    name: '차원 흡수',
    special: true,
    cost: { resources: 0, mana: 3 },
    effect: { type: 'gain', resources: 4, mana: 2 },
    description: '즉시 자원 4, 마나 2 획득.',
  },
];

// ---------------------------------------------------------------------------
// 덱 구성
// ---------------------------------------------------------------------------

/** 모든 플레이어가 공통으로 갖는 기본 덱 (18장). 여기에 특수 카드 3장을 더한다 */
export const BASE_DECK: readonly CardRef[] = [
  ...repeat({ type: 'building', specId: 'mine' }, 3),
  ...repeat({ type: 'building', specId: 'mana-well' }, 3),
  ...repeat({ type: 'building', specId: 'outpost' }, 2),
  ...repeat({ type: 'unit', specId: 'scout' }, 2),
  ...repeat({ type: 'unit', specId: 'soldier' }, 3),
  ...repeat({ type: 'unit', specId: 'tank' }, 1),
  ...repeat({ type: 'magic', specId: 'bolt' }, 2),
  ...repeat({ type: 'magic', specId: 'repair' }, 1),
  ...repeat({ type: 'magic', specId: 'harvest' }, 1),
];

/** 덱을 고르지 않은 플레이어(또는 AI)에게 주는 기본 선택 */
export const DEFAULT_DECK_CHOICE: DeckChoice = {
  buildingId: 'orbital-forge',
  unitId: 'titan',
  magicId: 'supernova',
};

function repeat(card: CardRef, n: number): CardRef[] {
  return Array.from({ length: n }, () => ({ ...card }));
}

// ---------------------------------------------------------------------------
// 조회
// ---------------------------------------------------------------------------

const buildingById = new Map(BUILDINGS.map((b) => [b.id, b]));
const unitById = new Map(UNITS.map((u) => [u.id, u]));
const magicById = new Map(MAGICS.map((m) => [m.id, m]));

export function getBuildingSpec(id: string): BuildingSpec | undefined {
  return buildingById.get(id);
}

export function getUnitSpec(id: string): UnitSpec | undefined {
  return unitById.get(id);
}

export function getMagicSpec(id: string): MagicSpec | undefined {
  return magicById.get(id);
}

export function getSpecialBuildings(): BuildingSpec[] {
  return BUILDINGS.filter((b) => b.special);
}

export function getSpecialUnits(): UnitSpec[] {
  return UNITS.filter((u) => u.special);
}

export function getSpecialMagics(): MagicSpec[] {
  return MAGICS.filter((m) => m.special);
}

/** 덱 선택이 유효한지 (각각 특수 카드 id인지) */
export function isValidDeckChoice(choice: DeckChoice): boolean {
  return (
    getBuildingSpec(choice.buildingId)?.special === true &&
    getUnitSpec(choice.unitId)?.special === true &&
    getMagicSpec(choice.magicId)?.special === true
  );
}
