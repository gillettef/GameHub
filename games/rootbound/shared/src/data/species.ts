/**
 * 식물 9종 (Rules.md 7절)과 목표 카드 16장 (Rules.md 8절). 수치는 이 파일 한 곳에만 둔다.
 * 2026-10-16 오프라인판: shared/scripts/lab 시뮬레이터로 맞춘 값이다. 바꾸면 Rules.md 표와 data.test.ts 도 함께 고친다.
 * 뿌리 모양 좌표: 방향 0 (+1,0), 1 (+1,−1), 2 (0,−1), 3 (−1,0), 4 (−1,+1), 5 (0,+1). 회전 0 기준이다.
 */
import type { GoalId, GoalSpec, RootSpot, SpeciesId, SpeciesSpec } from '../types/index.js';

const BASE: Omit<SpeciesSpec, 'id' | 'name' | 'description' | 'roots'> = {
  seed: 0,
  pondPlanting: false,
  wither: 0,
  bloomBonus: 0,
};

const r = (dq: number, dr: number, n: number): RootSpot => ({ dq, dr, n });

/** 표 순서 = 카드 번호 순서 */
export const SPECIES: readonly SpeciesSpec[] = [
  { ...BASE, id: 'grass', name: '잔디', description: '이어진 세 칸에 넓게 깐다.', roots: [r(0, 0, 2), r(1, 0, 1), r(1, -1, 1), r(0, -1, 1)] },
  { ...BASE, id: 'oak', name: '참나무', description: '양옆 두 칸을 두껍게 굳힌다.', roots: [r(0, 0, 2), r(1, 0, 2), r(-1, 0, 2)] },
  { ...BASE, id: 'pine', name: '소나무', description: '심은 칸은 거의 뺏기지 않는다.', roots: [r(0, 0, 3), r(1, 0, 1), r(-1, 0, 1)] },
  { ...BASE, id: 'kudzu', name: '칡', description: '한 줄로 두 칸 앞까지 파고든다.', roots: [r(0, 0, 1), r(1, 0, 1), r(2, 0, 2)] },
  { ...BASE, id: 'fern', name: '고사리', description: '바로 옆은 건너뛰고 멀리 세 칸에 퍼진다.', roots: [r(0, 0, 2), r(2, 0, 1), r(0, -2, 1), r(-2, 2, 1)] },
  { ...BASE, id: 'dandelion', name: '민들레', description: '심은 뒤 두 칸 안 아무 칸에 큐브 1개를 날린다.', roots: [r(0, 0, 1), r(1, 0, 1), r(-1, 0, 1)], seed: 1 },
  { ...BASE, id: 'lotus', name: '연꽃', description: '연못과 맞닿은 빈 칸이면 어디든 심을 수 있다.', roots: [r(0, 0, 2), r(1, 0, 1), r(-1, 0, 1)], pondPlanting: true },
  { ...BASE, id: 'mushroom', name: '버섯', description: '맞닿은 6칸에서 남의 큐브를 2개씩 걷어낸다.', roots: [r(0, 0, 2)], wither: 2 },
  { ...BASE, id: 'mugunghwa', name: '무궁화', description: '끝날 때 내 땅 위에 있으면 +1점.', roots: [r(0, 0, 2), r(1, 0, 1), r(1, -1, 1)], bloomBonus: 1 },
];

export const SPECIES_IDS: readonly SpeciesId[] = SPECIES.map((s) => s.id);

/** 목표 '꽃밭'이 세는 꽃, '숲'이 세는 나무. 이번 판 식물을 고를 때 이 목표가 나오면 하나 이상 넣는다 (Rules.md 4·8절) */
export const FLOWER_SPECIES: readonly SpeciesId[] = ['dandelion', 'lotus', 'mugunghwa'];
export const FOREST_SPECIES: readonly SpeciesId[] = ['oak', 'pine'];

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
  { id: 'big-garden', name: '큰 정원', description: '이어진 내 땅의 가장 큰 덩어리: 1등 +4, 2등 +2', species: null },
  { id: 'long-path', name: '오솔길', description: '한 직선으로 이어진 내 땅의 최대 길이: 1등 +4, 2등 +2', species: null },
  { id: 'fertile-field', name: '비옥한 밭', description: '기름진 땅인 내 땅 1칸당 +2', species: null },
  { id: 'edge-fence', name: '가장자리 울타리', description: '보드 가장자리인 내 땅 1칸당 +1', species: null },
  { id: 'center-plaza', name: '중앙 광장', description: '가운데 구역(7칸 묶음)에서 내 땅이 가장 많으면 +4', species: null },
  { id: 'every-tile', name: '구역마다 한 뼘', description: '내 땅이 있는 구역(7칸 묶음) 1개당 +1', species: null },
  { id: 'flower-bed', name: '꽃밭', description: '내 땅 위의 민들레·연꽃·무궁화 1개당 +2', species: null },
  { id: 'forest', name: '숲', description: '서로 맞닿은 내 땅 위 참나무·소나무 3개 이상 무리 1개당 +4', species: null },
  { id: 'variety', name: '여러 가지 심기', description: '내 땅 위에 서로 다른 식물이 5종 이상이면 +4', species: null },
  { id: 'pine-reserve', name: '소나무 보호구역', description: '내 땅 위의 소나무 1개당 +2', species: 'pine' },
  { id: 'kudzu-reserve', name: '칡 보호구역', description: '내 땅 위의 칡 1개당 +2', species: 'kudzu' },
  { id: 'fern-reserve', name: '고사리 보호구역', description: '내 땅 위의 고사리 1개당 +2', species: 'fern' },
  { id: 'grass-reserve', name: '잔디 보호구역', description: '내 땅 위의 잔디 1개당 +2', species: 'grass' },
  { id: 'mushroom-reserve', name: '버섯 보호구역', description: '내 땅 위의 버섯 1개당 +2', species: 'mushroom' },
  { id: 'dandelion-reserve', name: '민들레 보호구역', description: '내 땅 위의 민들레 1개당 +2', species: 'dandelion' },
];

const GOAL_BY_ID = new Map(GOALS.map((g) => [g.id, g]));

export function getGoal(id: GoalId): GoalSpec {
  const g = GOAL_BY_ID.get(id);
  if (!g) throw new Error(`알 수 없는 목표: ${id}`);
  return g;
}
