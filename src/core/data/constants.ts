// 규칙 수치 (Rules.md 의 (임시) 값). 엔진·UI·AI 는 여기서만 읽는다
import type { BuildingKind, CharterField, Direction, Doctrine, Mods, Res, UnitKind } from '../types';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const COLONIST_TOTAL = 24;
export const ROUND_LIMIT = 40;

export const START_RES: Res = { food: 2, prod: 2, energy: 0, sci: 2, culture: 0 };
export const SEAT_BONUS: Partial<Res>[] = [{}, { sci: 1, culture: 3 }, { prod: 1, sci: 1, culture: 5 }, { prod: 2, sci: 1, culture: 7 }];
export const FIRST_ROUND_COMMAND = [1, 2, 3, 3];

export const BASE_COMMAND = 3;
export const BASE_DEFENSE = 2;

// 퀘스트 트랙(쓰루의 카드 줄 자리): 칸 수
export const QUEST_ROW_SIZE = 5;

// 시대 전환: 현재 고리 줄기 합 ≥ 인원 × ERA_TRUNK_PER_PLAYER
export const ERA_TRUNK_PER_PLAYER = 4;
// 안전장치: 한 시대가 이 라운드 수만큼 지나면 넘어간다
export const ERA_MAX_ROUNDS = 8;

// 테크 웹
export const TRUNK_BASE_COST = [0, 4, 5, 6];
export const TWIG_BASE_COST = [0, 2, 3, 4];
export const RESEARCH_STEP = 5;

/** 방향별 줄기 해금: [건물/유닛 계열, 고리별 레벨] */
export const DIRECTION_UNLOCKS: Record<Direction, { building?: BuildingKind; units?: { kind: UnitKind; levels: number[] }[]; command?: number[]; defense?: number[] }> = {
  agri: { building: 'farm' },
  industry: { building: 'workshop' },
  power: { building: 'power' },
  academic: { building: 'lab', command: [0, 0, 0, 1] },
  culture: { building: 'hall', command: [0, 0, 1, 1] },
  // 군사 유닛 4계열은 모두 방위 방향이 연다. 인덱스 = 고리, 값 = 그 고리 줄기가 여는 레벨(0 = 없음)
  defense: {
    units: [
      { kind: 'guard', levels: [0, 1, 2, 3] },
      { kind: 'rider', levels: [0, 1, 2, 3] },
      { kind: 'battery', levels: [0, 0, 1, 2] },
      { kind: 'flyer', levels: [0, 0, 0, 1] },
    ],
    defense: [0, 0, 1, 1],
  },
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
  rider: 'defense',
  battery: 'defense',
  flyer: 'defense',
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
/** 유닛 총수 한도 = 기본 + 방위 줄기 수 × 줄기당 (Rules.md 7.3, 임시 수치) */
export const UNIT_POOL_BASE_CAP = 4;
export const UNIT_POOL_PER_TRUNK = 2;

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
export const FAMINE_CULTURE = 2;

/**
 * 정착민 공급 트랙(개인 보드에 인쇄, Rules 9.1, 수치 임시). 꺼낸 정착민 총수(배치+유휴)가 upTo 이하인 첫 구간을 읽는다.
 * 오프라인에서도 계산 없이 칸만 보고 식량 소비·필요 건강을 안다.
 */
export const COLONIST_TRACK: readonly { upTo: number; food: number; health: number }[] = [
  { upTo: 6, food: 0, health: 0 },
  { upTo: 8, food: 1, health: 0 },
  { upTo: 10, food: 1, health: 1 },
  { upTo: 12, food: 2, health: 2 },
  { upTo: 14, food: 2, health: 3 },
  { upTo: 16, food: 3, health: 4 },
  { upTo: 18, food: 3, health: 5 },
  { upTo: 20, food: 4, health: 6 },
  { upTo: 22, food: 4, health: 7 },
  { upTo: 24, food: 4, health: 8 },
];
export function colonistTrack(total: number): { upTo: number; food: number; health: number } {
  return COLONIST_TRACK.find((s) => total <= s.upTo) ?? COLONIST_TRACK[COLONIST_TRACK.length - 1];
}

// 건강·포자 안개(에너지 트랙의 기준치 다음 칸부터 SPORE_STEP 칸마다 '건강 −1' 표시)
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
export const raidAmount = (era: number) => Math.min(era, 3) + 2;
/** 납치할 유휴 정착민이 없을 때 대신 약탈하는 식량 */
export const ABDUCT_FALLBACK_FOOD = 3;
export const CONFLICT_FAIL_CULTURE = 2;
export const CONFLICT_CULTURE_MAX = 12;

// 위협
export const COEXIST_SYMBIONT = 2;
export const COEXIST_FOOD = 2;

// 주둔지
export const PATRON_LIMIT = 3;
export const PATRON_FAIL_CULTURE = 3;
/** 요구 충족 시 문화 = 시대 × 이 값 */
export const PATRON_MET_CULTURE_PER_ERA = 2;

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
  bond: [{}, { health: 2 }, { command: 1 }, { sight: 1, health: 2 }],
};

// 결실 정산
export const FRUITION_PER_STAGE = 3;
export const FRUITION_FIRST = 6;
export const FRUITION_OTHER = 3;
/** 종료 시대 진입 때 트랙을 채울 3시대 덱 장수 */
export const END_KEEP_ROW = 5;

// 이름
export const DOCTRINE_NAMES: Record<Doctrine, string> = { ark: '방주', symbiont: '공생', synth: '합성' };
export const RES_NAMES: Record<keyof Res, string> = { food: '식량', prod: '생산', energy: '에너지', sci: '과학', culture: '문화' };
export const BUILDING_NAMES: Record<BuildingKind, string> = { farm: '농장', workshop: '제작소', power: '발전소', lab: '연구소', hall: '회관' };
export const UNIT_NAMES: Record<UnitKind, string> = { guard: '경비대', rider: '기동대', battery: '포대', flyer: '비행대' };
export const DIRECTION_NAMES: Record<Direction, string> = { agri: '농업', industry: '산업', power: '동력', academic: '학술', culture: '문화', defense: '방위' };
/** 줄기 기술 이름: 방향별 [_, 1고리, 2고리, 3고리] (Rules.md 6.1) */
export const TRUNK_NAMES: Record<Direction, [string, string, string, string]> = {
  agri: ['', '정착 농경', '토착 목축', '행성 생태 농업'],
  industry: ['', '노천 채굴', '탄도 공학', '중공업 복합체'],
  power: ['', '태양 집광', '지열 발전', '반중력 비행'],
  academic: ['', '현장 탐사', '행성 과학', '통합 지휘망'],
  culture: ['', '개척 연대기', '공동 집회', '행성 시민권'],
  defense: ['', '경계 순찰', '방어 진지', '방위 사령부'],
};
export const CHARTER_NAMES: Record<CharterField, string> = { prosperity: '번영', explore: '탐구', defense: '방위', bond: '결속' };
export const LEVEL_NAMES = ['기초', 'Lv1', 'Lv2', 'Lv3'];
