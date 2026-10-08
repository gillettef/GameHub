/**
 * 식물 12종 (Rules.md 7절)과 목표 카드 18장 (Rules.md 8절). 수치는 이 파일 한 곳에만 둔다.
 * 2026-10-07 shared/scripts/garden-sim.ts 로 맞춘 값이다. 바꾸면 Rules.md 표와 data.test.ts 도 함께 고친다.
 */
import type { GoalId, GoalSpec, SpeciesId, SpeciesSpec } from '../types/index.js';

const BASE: Omit<SpeciesSpec, 'id' | 'name' | 'description'> = {
  self: 0,
  ring1: 0,
  star2: 0,
  line: 0,
  lineLength: 0,
  seed: 0,
  pondPlanting: false,
  ivy: 0,
  cluster: 0,
  wither: 0,
  fertileRing: 0,
  bloomBonus: 0,
};

/** 표 순서 = 드래프트 자동 픽 순서 (Rules.md 5절) */
export const SPECIES: readonly SpeciesSpec[] = [
  { ...BASE, id: 'grass', name: '잔디', description: '넓게 깔고 무난하게 버틴다.', self: 3, ring1: 1 },
  { ...BASE, id: 'oak', name: '참나무', description: '맞닿은 6칸을 한꺼번에 굳힌다.', self: 2, ring1: 2 },
  { ...BASE, id: 'pine', name: '소나무', description: '심은 칸은 거의 뺏기지 않는다.', self: 5, ring1: 1 },
  { ...BASE, id: 'kudzu', name: '칡', description: '한 방향을 골라 직선 두 칸에 2씩 뻗는다.', self: 2, line: 2, lineLength: 2 },
  { ...BASE, id: 'fern', name: '고사리', description: '바로 옆은 비우고 한 칸 건너뛴 6칸에 퍼진다.', self: 1, star2: 1 },
  { ...BASE, id: 'dandelion', name: '민들레', description: '심은 뒤 두 칸 안 빈 칸에 씨앗(영향력 2)을 날린다.', self: 1, ring1: 1, seed: 2 },
  { ...BASE, id: 'rapeseed', name: '유채', description: '기름진 땅에 심으면 맞닿은 칸에 3씩 준다. 다른 곳에서는 잔디보다 약하다.', self: 2, ring1: 1, fertileRing: 2 },
  { ...BASE, id: 'lotus', name: '연꽃', description: '연못과 맞닿은 빈 칸이면 뿌리가 닿지 않아도 심을 수 있다.', self: 1, ring1: 1, pondPlanting: true },
  { ...BASE, id: 'ivy', name: '담쟁이', description: '옆 칸 중 식물이 있는 칸에 1을 더 준다.', self: 1, ring1: 1, ivy: 1 },
  { ...BASE, id: 'bamboo', name: '대나무', description: '맞닿은 내 대나무 1개당 심은 칸 +2.', self: 1, ring1: 2, cluster: 2 },
  { ...BASE, id: 'mushroom', name: '버섯', description: '맞닿은 6칸에서 다른 모든 사람의 영향력을 2씩 줄인다.', self: 1, wither: 2 },
  { ...BASE, id: 'mugunghwa', name: '무궁화', description: '끝날 때 이 칸이 내 땅이면 +1점.', self: 2, ring1: 1, bloomBonus: 1 },
];

export const SPECIES_IDS: readonly SpeciesId[] = SPECIES.map((s) => s.id);

const SPECIES_BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

export function getSpecies(id: SpeciesId): SpeciesSpec {
  const s = SPECIES_BY_ID.get(id);
  if (!s) throw new Error(`알 수 없는 종: ${id}`);
  return s;
}

export function isSpeciesId(id: unknown): id is SpeciesId {
  return typeof id === 'string' && SPECIES_BY_ID.has(id as SpeciesId);
}

export const GOALS: readonly GoalSpec[] = [
  { id: 'pond-side', name: '연못가 산책로', description: '연못과 맞닿은 내 땅 1칸당 +1', species: null },
  { id: 'big-garden', name: '큰 정원', description: '이어진 내 땅의 가장 큰 덩어리: 1등 +6, 2등 +3', species: null },
  { id: 'long-path', name: '오솔길', description: '한 직선으로 이어진 내 땅의 최대 길이: 1등 +5, 2등 +2', species: null },
  { id: 'fertile-field', name: '비옥한 밭', description: '기름진 땅인 내 땅 1칸당 +2', species: null },
  { id: 'edge-fence', name: '가장자리 울타리', description: '보드 가장자리인 내 땅 1칸당 +1', species: null },
  { id: 'center-plaza', name: '중앙 광장', description: '가운데 구역(7칸 묶음)에서 내 땅이 가장 많으면 +6', species: null },
  { id: 'every-tile', name: '구역마다 한 뼘', description: '내 땅이 있는 구역(7칸 묶음) 1개당 +1', species: null },
  { id: 'flower-bed', name: '꽃밭', description: '내 땅 위의 유채·연꽃·무궁화 1개당 +2 (누가 심었든)', species: null },
  { id: 'forest', name: '숲', description: '이어진 내 참나무·대나무 3개 이상 무리 1개당 +4', species: null },
  { id: 'connected', name: '이어진 정원', description: '내 입구와 식물이 모두 이어져 있으면 +5', species: null },
  { id: 'border-guard', name: '경계 지키기', description: '다른 사람 땅과 맞닿은 내 땅 1칸당 +1', species: null },
  { id: 'full-set', name: '고른 식물 다 쓰기', description: '고른 식물을 모두 한 번 이상 심었으면 +4', species: null },
  { id: 'pine-reserve', name: '소나무 보호구역', description: '내 땅 위의 내 소나무 1개당 +2', species: 'pine' },
  { id: 'kudzu-reserve', name: '칡 보호구역', description: '내 땅 위의 내 칡 1개당 +2', species: 'kudzu' },
  { id: 'fern-reserve', name: '고사리 보호구역', description: '내 땅 위의 내 고사리 1개당 +2', species: 'fern' },
  { id: 'grass-reserve', name: '잔디 보호구역', description: '내 땅 위의 내 잔디 1개당 +2', species: 'grass' },
  { id: 'mushroom-reserve', name: '버섯 보호구역', description: '내 땅 위의 내 버섯 1개당 +2', species: 'mushroom' },
  { id: 'dandelion-reserve', name: '민들레 보호구역', description: '내 땅 위의 내 민들레 1개당 +2', species: 'dandelion' },
];

const GOAL_BY_ID = new Map(GOALS.map((g) => [g.id, g]));

export function getGoal(id: GoalId): GoalSpec {
  const g = GOAL_BY_ID.get(id);
  if (!g) throw new Error(`알 수 없는 목표: ${id}`);
  return g;
}

/** 함께 공개되지 않는 목표 쌍 (Rules.md 8절) */
export const GOAL_EXCLUSIONS: readonly [GoalId, GoalId][] = [['big-garden', 'connected']];
