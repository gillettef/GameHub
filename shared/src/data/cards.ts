/**
 * 카드 기준표 (Rules.md 10절). 수치는 이 파일에만 둔다.
 * 종족 3개(coalition/swarm/automata)가 완전히 다른 기본 카드 22종 + 특수 카드 풀 9종을 쓴다.
 * 2026-09-23부터 "기본/특수" 구분은 카탈로그 분류일 뿐, 덱 빌딩에서는 구분하지 않는다 — 같은
 * 종족의 카드라면 무엇이든 각 카드의 `copies`(덱 안 최대 장수) 상한까지 자유롭게 섞어 넣는다.
 * Rules.md 표와 일치하는지 data.test.ts 가 검증한다.
 */
import type { CardId, CardSpec, CardType, DeckChoice, RaceDef, RaceId } from '../types/index.js';
import { BASE_DECK_SIZE, CORE_BASE_INCOME, CORE_HP, CORE_SIGHT, DECK_SIZE } from './constants.js';

function baseOf(race: RaceId): Pick<CardSpec, 'race' | 'special' | 'keywords' | 'effect'> {
  return { race, special: false, keywords: [], effect: null };
}

/** 특수 카드 기본 상한 2장. 기본 카드보다 강한 만큼 낮게 잡는다(밸런스 1차값, 플레이테스트로 조정) */
const SPECIAL_MAX_COPIES = 2;

function specialOf(race: RaceId): Pick<CardSpec, 'race' | 'special' | 'keywords' | 'effect' | 'copies'> {
  return { race, special: true, keywords: [], effect: null, copies: SPECIAL_MAX_COPIES };
}

/** 10.1 코어. 덱에 없고 시작 시 자동 배치. 종족과 무관하게 전 좌석 동일(공정성) */
export const CORE_SPEC: CardSpec = {
  id: 'core',
  name: '코어',
  kind: 'core',
  race: null,
  special: false,
  cost: 0,
  sight: CORE_SIGHT,
  hp: CORE_HP,
  attack: 0,
  range: 0,
  production: CORE_BASE_INCOME,
  score: 0,
  keywords: [],
  effect: null,
  copies: 0,
  description: '시작 지점. 파괴되면 탈락한다.',
};

export const RACES: RaceDef[] = [
  { id: 'coalition', name: '인류 연합', concept: '균형 잡힌 확장과 방어' },
  { id: 'swarm', name: '크릴 군락', concept: '저비용 물량으로 몰아치는 초반 공세' },
  { id: 'automata', name: '오토마타 집정체', concept: '건물을 뭉쳐 세워 후반을 압도하는 축적형 경제' },
];

// ---------------------------------------------------------------------------
// 인류 연합 (coalition) — 기존 카드 그대로 유지 (엔진 테스트 다수가 이 수치를 직접 검증한다)
// ---------------------------------------------------------------------------

const coalitionBase = baseOf('coalition');
const coalitionSpecial = specialOf('coalition');

export const COALITION_BASE_CARDS: CardSpec[] = [
  { ...coalitionBase, id: 'extractor', name: '채굴기', kind: 'building', cost: 2, sight: 1, hp: 4, attack: 0, range: 0, production: 1, score: 2, copies: 4, description: '경제의 기본. 광맥 위에서는 생산 +1.' },
  { ...coalitionBase, id: 'outpost', name: '전초기지', kind: 'building', cost: 3, sight: 2, hp: 6, attack: 0, range: 0, production: 0, score: 3, copies: 3, description: '시야·영토 확장.' },
  { ...coalitionBase, id: 'turret', name: '방어탑', kind: 'building', cost: 4, sight: 1, hp: 6, attack: 2, range: 2, production: 0, score: 2, copies: 2, description: '고정 방어.' },
  { ...coalitionBase, id: 'scout', name: '정찰 드론', kind: 'unit', cost: 1, sight: 2, hp: 2, attack: 1, range: 1, production: 0, score: 1, copies: 3, description: '값싼 시야 확장.' },
  { ...coalitionBase, id: 'fighter', name: '전투기', kind: 'unit', cost: 3, sight: 1, hp: 4, attack: 2, range: 1, production: 0, score: 1, copies: 3, description: '근접 압박.' },
  { ...coalitionBase, id: 'artillery', name: '포격함', kind: 'unit', cost: 4, sight: 1, hp: 3, attack: 3, range: 3, production: 0, score: 1, copies: 2, description: '긴 사거리, 낮은 체력.' },
  { ...coalitionBase, id: 'cruiser', name: '순양함', kind: 'unit', cost: 5, sight: 1, hp: 7, attack: 3, range: 2, production: 0, score: 2, copies: 1, description: '중견 전력.' },
  { ...coalitionBase, id: 'meteor', name: '유성우', kind: 'magic', cost: 3, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 1, effect: { kind: 'damage', amount: 3, radius: 1 }, description: '즉발: 반경 1 적 마커 전부에 피해 3.' },
  { ...coalitionBase, id: 'shield', name: '차폐막', kind: 'magic', cost: 2, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 1, effect: { kind: 'heal', amount: 3, radius: 1 }, description: '즉발: 반경 1 아군 마커 전부 체력 +3.' },
  { ...coalitionBase, id: 'energy-cell', name: '에너지 결정', kind: 'magic', cost: 0, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 2, effect: { kind: 'energy', amount: 3 }, description: '즉발: 에너지 +3. 초반 경제 보조. 빈 칸에 놓고 즉시 사라진다.' },
];

export const COALITION_SPECIAL_CARDS: CardSpec[] = [
  { ...coalitionSpecial, id: 'refinery', name: '정제소', kind: 'building', cost: 5, sight: 1, hp: 5, attack: 0, range: 0, production: 3, score: 4, description: '생산 +3.' },
  { ...coalitionSpecial, id: 'observatory', name: '관측소', kind: 'building', cost: 4, sight: 3, hp: 4, attack: 0, range: 0, production: 0, score: 3, description: '넓은 시야.' },
  { ...coalitionSpecial, id: 'fortress', name: '요새', kind: 'building', cost: 6, sight: 2, hp: 12, attack: 2, range: 2, production: 0, score: 5, description: '튼튼한 방어 거점.' },
  { ...coalitionSpecial, id: 'battleship', name: '전함', kind: 'unit', cost: 8, sight: 2, hp: 12, attack: 4, range: 2, production: 0, score: 3, description: '최강 전력.' },
  { ...coalitionSpecial, id: 'stealth', name: '스텔스함', kind: 'unit', cost: 5, sight: 1, hp: 4, attack: 3, range: 1, production: 0, score: 1, keywords: ['infiltrate'], description: '침투: 적 마커 거리 1 이내에도 배치 가능.' },
  { ...coalitionSpecial, id: 'repair-drone', name: '수리 드론', kind: 'unit', cost: 3, sight: 1, hp: 2, attack: 0, range: 0, production: 0, score: 1, keywords: ['repair'], description: '정비: 내 턴을 끝낼 때(전투 직후) 반경 1 아군 체력 +1.' },
  { ...coalitionSpecial, id: 'gravity-wave', name: '중력파', kind: 'magic', cost: 5, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, effect: { kind: 'damage', amount: 2, radius: 2 }, description: '즉발: 반경 2 적 마커 전부에 피해 2.' },
  { ...coalitionSpecial, id: 'warp-gate', name: '워프 게이트', kind: 'magic', cost: 3, sight: 3, hp: 2, attack: 0, range: 0, production: 0, score: 0, effect: { kind: 'persistent', durationTurns: 3 }, description: '지속 3턴: 시야 3 제공. 파괴 가능.' },
  { ...coalitionSpecial, id: 'energy-storm', name: '에너지 폭풍', kind: 'magic', cost: 2, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, effect: { kind: 'energy', amount: 6 }, description: '즉발: 에너지 +6.' },
];

// ---------------------------------------------------------------------------
// 크릴 군락 (swarm) — 숫자와 속도. 저비용 다수 유닛, 침투 다수 보유
// ---------------------------------------------------------------------------

const swarmBase = baseOf('swarm');
const swarmSpecial = specialOf('swarm');

export const SWARM_BASE_CARDS: CardSpec[] = [
  { ...swarmBase, id: 'larva-nest', name: '알집', kind: 'building', cost: 1, sight: 1, hp: 3, attack: 0, range: 0, production: 1, score: 1, copies: 3, description: '가장 싼 경제 건물. 광맥 위에서는 생산 +1.' },
  { ...swarmBase, id: 'bio-spire', name: '생체첨탑', kind: 'building', cost: 3, sight: 2, hp: 5, attack: 0, range: 0, production: 0, score: 3, copies: 3, description: '시야·영토 확장.' },
  { ...swarmBase, id: 'spike-turret', name: '가시탑', kind: 'building', cost: 4, sight: 1, hp: 5, attack: 3, range: 1, production: 0, score: 2, copies: 2, description: '근접 방어. 사거리는 짧지만 공격력이 높다.' },
  { ...swarmBase, id: 'drone', name: '유충병', kind: 'unit', cost: 1, sight: 1, hp: 2, attack: 1, range: 1, production: 0, score: 1, copies: 3, keywords: ['infiltrate'], description: '가장 싼 공격 유닛. 침투: 적 마커 거리 1 이내에도 배치 가능.' },
  { ...swarmBase, id: 'stalker', name: '추적자', kind: 'unit', cost: 2, sight: 1, hp: 3, attack: 2, range: 1, production: 0, score: 1, copies: 4, keywords: ['infiltrate'], description: '군락의 주력. 침투: 적 마커 거리 1 이내에도 배치 가능.' },
  { ...swarmBase, id: 'spitter', name: '산성분사체', kind: 'unit', cost: 3, sight: 1, hp: 3, attack: 2, range: 2, production: 0, score: 1, copies: 2, description: '값싼 사거리 압박.' },
  { ...swarmBase, id: 'brood-queen', name: '산란여왕', kind: 'unit', cost: 5, sight: 1, hp: 6, attack: 2, range: 1, production: 0, score: 2, copies: 1, keywords: ['repair'], description: '군락에서 가장 비싼 유닛. 정비: 내 턴을 끝낼 때 반경 1 아군 체력 +1.' },
  { ...swarmBase, id: 'acid-spray', name: '산성 포자', kind: 'magic', cost: 2, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 2, effect: { kind: 'damage', amount: 2, radius: 1 }, description: '즉발: 반경 1 적 마커 전부에 피해 2.' },
  { ...swarmBase, id: 'swarm-call', name: '소집 신호', kind: 'magic', cost: 0, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 1, effect: { kind: 'energy', amount: 2 }, description: '즉발: 에너지 +2.' },
  { ...swarmBase, id: 'frenzy', name: '광란', kind: 'magic', cost: 1, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 1, effect: { kind: 'heal', amount: 2, radius: 1 }, description: '즉발: 반경 1 아군 마커 전부 체력 +2.' },
];

export const SWARM_SPECIAL_CARDS: CardSpec[] = [
  { ...swarmSpecial, id: 'hive-fortress', name: '군체 요새', kind: 'building', cost: 6, sight: 2, hp: 14, attack: 3, range: 1, production: 0, score: 5, description: '군락의 방어 거점. 근접 전용.' },
  { ...swarmSpecial, id: 'chitin-refinery', name: '키틴 정제소', kind: 'building', cost: 5, sight: 1, hp: 5, attack: 0, range: 0, production: 3, score: 4, description: '생산 +3.' },
  { ...swarmSpecial, id: 'spore-tower', name: '포자탑', kind: 'building', cost: 4, sight: 3, hp: 4, attack: 0, range: 0, production: 0, score: 3, description: '넓은 시야.' },
  { ...swarmSpecial, id: 'alpha-brood', name: '알파 개체', kind: 'unit', cost: 7, sight: 2, hp: 10, attack: 4, range: 1, production: 0, score: 3, description: '군락에서 가장 강한 개체. 근접 전용.' },
  { ...swarmSpecial, id: 'burrower', name: '잠행자', kind: 'unit', cost: 4, sight: 1, hp: 4, attack: 2, range: 1, production: 0, score: 1, keywords: ['infiltrate'], description: '침투: 적 마커 거리 1 이내에도 배치 가능.' },
  { ...swarmSpecial, id: 'nurse-drone', name: '치유충', kind: 'unit', cost: 2, sight: 1, hp: 2, attack: 0, range: 0, production: 0, score: 1, keywords: ['repair'], description: '정비: 내 턴을 끝낼 때 반경 1 아군 체력 +1.' },
  { ...swarmSpecial, id: 'plague-burst', name: '역병 폭발', kind: 'magic', cost: 5, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, effect: { kind: 'damage', amount: 3, radius: 2 }, description: '즉발: 반경 2 적 마커 전부에 피해 3.' },
  { ...swarmSpecial, id: 'pheromone-beacon', name: '페로몬 신호기', kind: 'magic', cost: 3, sight: 3, hp: 2, attack: 0, range: 0, production: 0, score: 0, effect: { kind: 'persistent', durationTurns: 3 }, description: '지속 3턴: 시야 3 제공. 파괴 가능.' },
  { ...swarmSpecial, id: 'overgrowth', name: '대증식', kind: 'magic', cost: 2, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, effect: { kind: 'energy', amount: 5 }, description: '즉발: 에너지 +5.' },
];

// ---------------------------------------------------------------------------
// 오토마타 집정체 (automata) — 축적과 압도. 전 카드가 비싸고, 과부하로 후반 생산이 폭증
// ---------------------------------------------------------------------------

const automataBase = baseOf('automata');
const automataSpecial = specialOf('automata');

export const AUTOMATA_BASE_CARDS: CardSpec[] = [
  { ...automataBase, id: 'fab-node', name: '제작 노드', kind: 'building', cost: 3, sight: 1, hp: 6, attack: 0, range: 0, production: 1, score: 3, copies: 3, keywords: ['overclock'], description: '경제의 기본. 과부하: 반경 1 이내 자신 건물 수만큼 생산 추가.' },
  { ...automataBase, id: 'sentry-pylon', name: '감시 첨탑', kind: 'building', cost: 4, sight: 3, hp: 5, attack: 0, range: 0, production: 0, score: 3, copies: 2, description: '넓은 시야.' },
  { ...automataBase, id: 'bastion', name: '보루', kind: 'building', cost: 5, sight: 1, hp: 10, attack: 2, range: 2, production: 0, score: 3, copies: 2, description: '튼튼한 고정 방어.' },
  { ...automataBase, id: 'probe', name: '정찰 유닛', kind: 'unit', cost: 1, sight: 2, hp: 2, attack: 0, range: 0, production: 0, score: 1, copies: 4, description: '공격력이 없는 순수 정찰용. 군락과 달리 초반 공세 수단이 없다.' },
  { ...automataBase, id: 'sentinel', name: '파수병', kind: 'unit', cost: 4, sight: 1, hp: 5, attack: 2, range: 1, production: 0, score: 1, copies: 3, description: '기본 전투 유닛. 다른 종족보다 값이 비싸다.' },
  { ...automataBase, id: 'railgun-frame', name: '레일건 유닛', kind: 'unit', cost: 5, sight: 1, hp: 4, attack: 4, range: 3, production: 0, score: 2, copies: 2, description: '긴 사거리, 높은 화력.' },
  { ...automataBase, id: 'dreadnought-core', name: '드레드노트 코어', kind: 'unit', cost: 6, sight: 1, hp: 10, attack: 3, range: 2, production: 0, score: 3, copies: 1, description: '기본 덱에서 가장 강한 유닛.' },
  { ...automataBase, id: 'overload-pulse', name: '과부하 펄스', kind: 'magic', cost: 4, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 2, effect: { kind: 'damage', amount: 2, radius: 1 }, description: '즉발: 반경 1 적 마커 전부에 피해 2.' },
  { ...automataBase, id: 'nanite-repair', name: '나노 수복', kind: 'magic', cost: 3, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 1, effect: { kind: 'heal', amount: 4, radius: 1 }, description: '즉발: 반경 1 아군 마커 전부 체력 +4.' },
  { ...automataBase, id: 'power-surge', name: '전력 폭증', kind: 'magic', cost: 0, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 2, effect: { kind: 'energy', amount: 2 }, description: '즉발: 에너지 +2. 이 종족에서 가장 싼 카드.' },
];

export const AUTOMATA_SPECIAL_CARDS: CardSpec[] = [
  { ...automataSpecial, id: 'singularity-forge', name: '특이점 공방', kind: 'building', cost: 7, sight: 1, hp: 10, attack: 0, range: 0, production: 4, score: 6, keywords: ['overclock'], description: '생산 +4. 과부하: 반경 1 이내 자신 건물 수만큼 생산 추가.' },
  { ...automataSpecial, id: 'deep-scanner', name: '심층 스캐너', kind: 'building', cost: 5, sight: 4, hp: 4, attack: 0, range: 0, production: 0, score: 4, description: '아주 넓은 시야.' },
  { ...automataSpecial, id: 'citadel', name: '성채', kind: 'building', cost: 8, sight: 2, hp: 16, attack: 3, range: 2, production: 0, score: 6, description: '게임에서 가장 튼튼한 건물.' },
  { ...automataSpecial, id: 'titan', name: '타이탄', kind: 'unit', cost: 8, sight: 2, hp: 14, attack: 5, range: 2, production: 0, score: 4, description: '게임에서 가장 강한 유닛.' },
  { ...automataSpecial, id: 'cloak-unit', name: '위장 유닛', kind: 'unit', cost: 6, sight: 1, hp: 5, attack: 3, range: 1, production: 0, score: 2, keywords: ['infiltrate'], description: '침투: 적 마커 거리 1 이내에도 배치 가능.' },
  { ...automataSpecial, id: 'repair-node', name: '수복 노드', kind: 'unit', cost: 4, sight: 1, hp: 3, attack: 0, range: 0, production: 0, score: 1, keywords: ['repair'], description: '정비: 내 턴을 끝낼 때 반경 1 아군 체력 +1.' },
  { ...automataSpecial, id: 'graviton-lance', name: '중력자 랜스', kind: 'magic', cost: 6, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, effect: { kind: 'damage', amount: 3, radius: 2 }, description: '즉발: 반경 2 적 마커 전부에 피해 3.' },
  { ...automataSpecial, id: 'stasis-field', name: '정지장', kind: 'magic', cost: 4, sight: 4, hp: 3, attack: 0, range: 0, production: 0, score: 0, effect: { kind: 'persistent', durationTurns: 3 }, description: '지속 3턴: 시야 4 제공. 파괴 가능.' },
  { ...automataSpecial, id: 'core-surge', name: '코어 증폭', kind: 'magic', cost: 3, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, effect: { kind: 'energy', amount: 7 }, description: '즉발: 에너지 +7.' },
];

// ---------------------------------------------------------------------------
// 종족별 조회 테이블
// ---------------------------------------------------------------------------

export const BASE_CARDS_BY_RACE: Record<RaceId, CardSpec[]> = {
  coalition: COALITION_BASE_CARDS,
  swarm: SWARM_BASE_CARDS,
  automata: AUTOMATA_BASE_CARDS,
};

export const SPECIAL_CARDS_BY_RACE: Record<RaceId, CardSpec[]> = {
  coalition: COALITION_SPECIAL_CARDS,
  swarm: SWARM_SPECIAL_CARDS,
  automata: AUTOMATA_SPECIAL_CARDS,
};

/** 모든 카드 + 코어 */
export const ALL_SPECS: CardSpec[] = [
  CORE_SPEC,
  ...Object.values(BASE_CARDS_BY_RACE).flat(),
  ...Object.values(SPECIAL_CARDS_BY_RACE).flat(),
];

const SPEC_BY_ID: Record<CardId, CardSpec> = Object.fromEntries(ALL_SPECS.map((s) => [s.id, s]));

export function getSpec(id: CardId): CardSpec {
  const spec = SPEC_BY_ID[id];
  if (!spec) throw new Error(`알 수 없는 카드: ${id}`);
  return spec;
}

export function hasSpec(id: CardId): boolean {
  return id in SPEC_BY_ID;
}

/** 종족의 기본 덱을 카드 id 배열로 펼친 것 (셔플 전 순서) */
export function baseDeckOf(race: RaceId): CardId[] {
  return BASE_CARDS_BY_RACE[race].flatMap((c) => Array<CardId>(c.copies).fill(c.id));
}

for (const race of RACES) {
  const size = baseDeckOf(race.id).length;
  if (size !== BASE_DECK_SIZE) {
    throw new Error(`${race.id} 기본 덱 장수 불일치: ${size} !== ${BASE_DECK_SIZE}`);
  }
}

export function specialCardsOf(race: RaceId, type: CardType): CardSpec[] {
  return SPECIAL_CARDS_BY_RACE[race].filter((c) => c.kind === type);
}

/** 종족의 카드 전체(기본 + 특수, 구분 없이) — 덱 빌딩은 이 풀에서 자유롭게 고른다 */
export function cardPoolOf(race: RaceId): CardSpec[] {
  return [...BASE_CARDS_BY_RACE[race], ...SPECIAL_CARDS_BY_RACE[race]];
}

/** 덱 빌딩을 건너뛸 때(AI 좌석, 테스트) 쓰는 기본 선택: 인류 연합 기본 카드 22장 + 특수 카드 3장 */
export const DEFAULT_DECK_CHOICE: DeckChoice = {
  race: 'coalition',
  cards: {
    ...Object.fromEntries(COALITION_BASE_CARDS.map((c) => [c.id, c.copies])),
    refinery: 1,
    battleship: 1,
    'gravity-wave': 1,
  },
};

/** 덱 선택이 유효한 종족의 카드로만, 카드당 상한(copies) 이내, 합계 DECK_SIZE 장인지 검사한다 */
export function isValidDeckChoice(choice: DeckChoice): boolean {
  if (!RACES.some((r) => r.id === choice.race)) return false;
  const pool = new Map(cardPoolOf(choice.race).map((c) => [c.id, c] as const));
  let total = 0;
  for (const [id, n] of Object.entries(choice.cards)) {
    const spec = pool.get(id);
    // 장수가 0이어도 카드 id 자체는 그 종족의 실제 카드여야 한다(모르는 id를 0장으로 끼워 넣는 것도 거부)
    if (!spec || !Number.isInteger(n) || n < 0 || n > spec.copies) return false;
    total += n;
  }
  return total === DECK_SIZE;
}

/** 고른 카드를 장수만큼 펼친다 (셔플 전 순서). choice 는 isValidDeckChoice 를 통과해야 한다 */
export function buildDeck(choice: DeckChoice): CardId[] {
  if (!isValidDeckChoice(choice)) throw new Error('유효하지 않은 덱 선택입니다');
  const out: CardId[] = [];
  for (const [id, n] of Object.entries(choice.cards)) out.push(...Array<CardId>(n).fill(id));
  return out;
}
