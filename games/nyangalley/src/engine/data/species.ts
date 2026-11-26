/**
 * 식물 9종 (Rules.md 7절)과 목표 카드 16장 (Rules.md 8절). 2026-11-26 화면 테마를 「냥냥 골목」(골목 길고양이)으로 바꿔
 * name·description 은 고양이 테마(식물 → 명당, 목표 → 소문 카드)다. id·수치는 그대로. 수치는 이 파일 한 곳에만 둔다.
 * 2026-10-16 오프라인판: tools/lab 시뮬레이터로 맞춘 값이다. 바꾸면 Rules.md 표와 data.test.ts 도 함께 고친다.
 * 뿌리 모양 좌표: 방향 0 (+1,0), 1 (+1,−1), 2 (0,−1), 3 (−1,0), 4 (−1,+1), 5 (0,+1). 회전 0 기준이다.
 */
import type { GoalId, GoalSpec, RootSpot, SpeciesId, SpeciesSpec } from '../types.js';

const BASE: Omit<SpeciesSpec, 'id' | 'name' | 'description' | 'roots'> = {
  seed: 0,
  pondPlanting: false,
  wither: 0,
  bloomBonus: 0,
};

const r = (dq: number, dr: number, n: number): RootSpot => ({ dq, dr, n });

/** 표 순서 = 카드 번호 순서 */
export const SPECIES: readonly SpeciesSpec[] = [
  { ...BASE, id: 'grass', name: '화단', description: '이어진 옆 칸 세 곳으로 고양이가 퍼진다.', roots: [r(0, 0, 2), r(1, 0, 1), r(1, -1, 1), r(0, -1, 1)] },
  { ...BASE, id: 'oak', name: '평상', description: '양옆 칸까지 고양이가 두껍게 눕는다.', roots: [r(0, 0, 2), r(1, 0, 2), r(-1, 0, 2)] },
  { ...BASE, id: 'pine', name: '종이 상자', description: '상자 안 고양이는 좀처럼 쫓겨나지 않는다.', roots: [r(0, 0, 3), r(1, 0, 1), r(-1, 0, 1)] },
  { ...BASE, id: 'kudzu', name: '쥐구멍', description: '쥐를 쫓아 한 줄로 두 칸 앞까지 달려간다.', roots: [r(0, 0, 1), r(1, 0, 1), r(2, 0, 2)] },
  { ...BASE, id: 'fern', name: '지붕', description: '바로 옆은 건너뛰고 지붕을 타고 멀리 세 곳에 내려앉는다.', roots: [r(0, 0, 2), r(2, 0, 1), r(0, -2, 1), r(-2, 2, 1)] },
  { ...BASE, id: 'dandelion', name: '캣닢 화분', description: '놓은 뒤 신난 고양이 1마리가 두 칸 안 아무 칸으로 뛰어간다.', roots: [r(0, 0, 1), r(1, 0, 1), r(-1, 0, 1)], seed: 1 },
  { ...BASE, id: 'lotus', name: '낚시꾼', description: '개울과 맞닿은 칸이면 어디든 놓을 수 있다.', roots: [r(0, 0, 2), r(1, 0, 1), r(-1, 0, 1)], pondPlanting: true },
  { ...BASE, id: 'mushroom', name: '빗자루 할머니', description: '맞닿은 6칸에서 남의 고양이를 2마리씩 쫓아낸다.', roots: [r(0, 0, 2)], wither: 2 },
  { ...BASE, id: 'mugunghwa', name: '캣맘 급식소', description: '끝날 때 내 영역 위에 있으면 +1점.', roots: [r(0, 0, 2), r(1, 0, 1), r(1, -1, 1)], bloomBonus: 1 },
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
  { id: 'pond-side', name: '개울가 산책', description: '개울과 맞닿은 내 칸 1칸당 +1', species: null },
  { id: 'big-garden', name: '가장 넓은 영역', description: '이어진 내 칸의 가장 큰 덩어리: 1등 +4, 2등 +2', species: null },
  { id: 'long-path', name: '쭉 뻗은 골목', description: '한 직선으로 이어진 내 칸의 가장 긴 줄: 1등 +4, 2등 +2', species: null },
  { id: 'fertile-field', name: '양지바른 곳', description: '햇볕 자리인 내 칸 1칸당 +2', species: null },
  { id: 'edge-fence', name: '동네 어귀', description: '보드 가장자리인 내 칸 1칸당 +1', species: null },
  { id: 'center-plaza', name: '동네 한복판', description: '가운데 조각(7칸)에서 내 칸이 가장 많으면 +4', species: null },
  { id: 'every-tile', name: '온 동네 마실', description: '내 칸이 있는 조각(7칸 묶음, 아지트 조각 포함) 1장당 +1', species: null },
  { id: 'flower-bed', name: '맛집 골목', description: '내 영역 위 캣닢 화분·낚시꾼·캣맘 급식소 1개당 +2', species: null },
  { id: 'forest', name: '아늑한 아지트', description: '서로 맞닿은 내 영역 위 평상·종이 상자 3개 이상 무리 1개당 +4', species: null },
  { id: 'variety', name: '명당 수집가', description: '내 영역 위에 서로 다른 명당이 5종 이상이면 +4', species: null },
  { id: 'pine-reserve', name: '상자 단골', description: '내 영역 위의 종이 상자 1개당 +2', species: 'pine' },
  { id: 'kudzu-reserve', name: '쥐구멍 단골', description: '내 영역 위의 쥐구멍 1개당 +2', species: 'kudzu' },
  { id: 'fern-reserve', name: '지붕 단골', description: '내 영역 위의 지붕 1개당 +2', species: 'fern' },
  { id: 'grass-reserve', name: '화단 단골', description: '내 영역 위의 화단 1개당 +2', species: 'grass' },
  { id: 'mushroom-reserve', name: '할머니 단골', description: '내 영역 위의 빗자루 할머니 1개당 +2', species: 'mushroom' },
  { id: 'dandelion-reserve', name: '캣닢 단골', description: '내 영역 위의 캣닢 화분 1개당 +2', species: 'dandelion' },
];

const GOAL_BY_ID = new Map(GOALS.map((g) => [g.id, g]));

export function getGoal(id: GoalId): GoalSpec {
  const g = GOAL_BY_ID.get(id);
  if (!g) throw new Error(`알 수 없는 목표: ${id}`);
  return g;
}
