// 규칙 수치 (Rules.md 의 (임시) 값). 엔진·UI·AI 는 여기서만 읽는다
import type { BuildingKind, CharterField, Direction, Doctrine, Mods, Res, UnitKind } from '../types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const COLONIST_TOTAL = 24;
export const ROUND_LIMIT = 40;

export const START_RES: Res = { food: 2, prod: 2, energy: 0, sci: 2, culture: 0 };
export const SEAT_BONUS: Partial<Res>[] = [{}, { sci: 1 }, { prod: 1, sci: 1 }, { prod: 2, sci: 1 }];
export const FIRST_ROUND_COMMAND = [2, 3, 4, 4];

export const BASE_COMMAND = 4;
export const BASE_DEFENSE = 2;

// 카드 줄
export const CARD_ROW_SIZE = 9;
export const ROW_DISCARD: Record<number, number> = { 2: 3, 3: 2, 4: 1 };
export const slotCost = (slot: number) => (slot < 3 ? 1 : slot < 6 ? 2 : 3);

// 시대 전환: 현재 고리 줄기 합 ≥ 인원 × ERA_TRUNK_PER_PLAYER
export const ERA_TRUNK_PER_PLAYER = 3;
// 안전장치: 한 시대가 이 라운드 수만큼 지나면 넘어간다
export const ERA_MAX_ROUNDS = 8;

// 테크 웹
export const TRUNK_BASE_COST = [0, 3, 5, 7];
export const TWIG_BASE_COST = [0, 2, 3, 4];
export const RESEARCH_STEP = 5;
export const TWIG_POOL_PICK_PER_DOCTRINE = 4;

/** 방향별 줄기 해금: [건물/유닛 계열, 고리별 레벨] */
export const DIRECTION_UNLOCKS: Record<Direction, { building?: BuildingKind; unit?: { kind: UnitKind; levels: number[] }; command?: number[]; defense?: number[] }> = {
  agri: { building: 'farm', unit: { kind: 'rider', levels: [0, 1, 2, 3] } },
  industry: { building: 'workshop', unit: { kind: 'battery', levels: [0, 0, 1, 2] } },
  power: { building: 'power', unit: { kind: 'flyer', levels: [0, 0, 0, 1] } },
  academic: { building: 'lab', command: [0, 0, 0, 1] },
  culture: { building: 'hall', command: [0, 0, 1, 1] },
  defense: { unit: { kind: 'guard', levels: [0, 1, 2, 3] }, defense: [0, 0, 1, 1] },
};
/** 건물 계열을 해금하는 방향 */
export const BUILDING_DIRECTION: Record<BuildingKind, Direction> = {
  farm: 'agri',
  workshop: 'industry',
  power: 'power',
  lab: 'academic',
  hall: 'culture',
};
export const UNIT_DIRECTION: Record<UnitKind, Direction> = {
  guard: 'defense',
  rider: 'agri',
  battery: 'industry',
  flyer: 'power',
};
// 건물: 레벨별 비용·생산 (null = 없는 레벨)
export const BUILDING_COST = [2, 4, 6, 8];
export const BUILDING_OUTPUT: Record<BuildingKind, (number | null)[]> = {
  farm: [1, 2, 3, 4],
  workshop: [1, 2, 3, 5],
  power: [null, 2, 3, 4],
  lab: [1, 2, 3, 4],
  hall: [null, 1, 2, 3],
};
export const BUILDING_RES: Record<BuildingKind, keyof Res> = {
  farm: 'food',
  workshop: 'prod',
  power: 'energy',
  lab: 'sci',
  hall: 'culture',
};
export const FAMILY_BASE_CAP = 2;

// 유닛
export const UNIT_COST: Record<UnitKind, (number | null)[]> = {
  guard: [2, 3, 5, 7],
  rider: [null, 3, 5, 7],
  battery: [null, 5, 8, null],
  flyer: [null, 8, null, null],
};
export const UNIT_POWER: Record<UnitKind, (number | null)[]> = {
  guard: [1, 2, 3, 5],
  rider: [null, 2, 3, 5],
  battery: [null, 3, 5, null],
  flyer: [null, 5, null, null],
};
export const FLYER_ENERGY = 2;
export const GUARD_MAX = 2;

// 정착민
export const COLONIST_FOOD = [0, 2, 3, 4, 4];
export function foodUpkeep(total: number): number {
  if (total <= 6) return 0;
  if (total <= 10) return 1;
  if (total <= 14) return 2;
  if (total <= 18) return 3;
  return 4;
}
export const FAMINE_CULTURE = 2;

// 안정도·포자 안개
export const STABILITY_FREE = 6;
export const SPORE_CAP = 8;
export const SPORE_STEP = 3;

// 노선
export const DOCTRINE_STEP = 4;
export const DOCTRINE_MAX_STAGE = 4;
export const STAGE4_CULTURE = 5;
export const EDGE_BONUS = 2;
export const BEATS: Record<Doctrine, Doctrine> = { ark: 'synth', synth: 'symbiont', symbiont: 'ark' };

// 대외 단계
export const RAID_DEFENSE = 2;
export const CONFLICT_DEFENSE = 3;
export const PULL_DEFENSE = 1;
export const raidAmount = (era: number) => Math.min(era, 3) + 2;
export const CONFLICT_FAIL_CULTURE = 2;
export const CONFLICT_CULTURE_MAX = 12;

// 위협
export const COEXIST_SYMBIONT = 2;
export const COEXIST_FOOD = 2;

// 후원 계약
export const PATRON_LIMIT = 3;
export const PATRON_FAIL_CULTURE = 3;

// 궤도
export const ORBIT_SLOTS = 2;
export const SAT_MARKET = 3;

// 헌장
export const CHARTER_COST = [0, 3, 6, 9];
export const CHARTER_FULL_POINTS = 4;
export const CHARTER_MODS: Record<CharterField, Partial<Mods>[]> = {
  prosperity: [{}, { buildingCap: 1 }, { foodUpkeep: 1 }, { income: { prod: 2 } }],
  explore: [{}, { trunkDiscount: 1 }, { income: { sci: 2 } }, {}],
  defense: [{}, { unitCap: 1 }, { defense: 1 }, { might: 3 }],
  bond: [{}, { stability: 2 }, { command: 1 }, { sight: 1, stability: 2 }],
};

// 결실 정산
export const FRUITION_PER_STAGE = 3;
export const FRUITION_FIRST = 6;
export const FRUITION_OTHER = 3;
export const END_KEEP_FUTURE = 3;

// 이름
export const DOCTRINE_NAMES: Record<Doctrine, string> = { ark: '방주', symbiont: '공생', synth: '합성' };
export const RES_NAMES: Record<keyof Res, string> = { food: '식량', prod: '생산', energy: '에너지', sci: '과학', culture: '문화' };
export const BUILDING_NAMES: Record<BuildingKind, string> = { farm: '농장', workshop: '제작소', power: '발전소', lab: '연구소', hall: '회관' };
export const UNIT_NAMES: Record<UnitKind, string> = { guard: '경비대', rider: '기동대', battery: '포대', flyer: '비행대' };
export const DIRECTION_NAMES: Record<Direction, string> = { agri: '농업', industry: '산업', power: '동력', academic: '학술', culture: '문화', defense: '방위' };
export const CHARTER_NAMES: Record<CharterField, string> = { prosperity: '번영', explore: '탐구', defense: '방위', bond: '결속' };
export const LEVEL_NAMES = ['기초', 'Lv1', 'Lv2', 'Lv3'];
