/**
 * 카드 기준표 (Rules.md 10절). 수치는 이 파일에만 둔다.
 * Rules.md 표와 일치하는지 data.test.ts 가 검증한다.
 */
import type { CardId, CardSpec, CardType, DeckChoice } from '../types/index.js';
import { BASE_DECK_SIZE, CORE_BASE_INCOME, CORE_HP, CORE_SIGHT, SPECIAL_PICKS } from './constants.js';

const base: Pick<CardSpec, 'special' | 'keywords' | 'effect'> = {
  special: false,
  keywords: [],
  effect: null,
};

const special: Pick<CardSpec, 'special' | 'keywords' | 'effect' | 'copies'> = {
  special: true,
  keywords: [],
  effect: null,
  copies: 0,
};

/** 10.1 코어. 덱에 없고 시작 시 자동 배치 */
export const CORE_SPEC: CardSpec = {
  id: 'core',
  name: '코어',
  kind: 'core',
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

/** 10.2 기본 덱 (22장, 전원 동일) */
export const BASE_CARDS: CardSpec[] = [
  { ...base, id: 'extractor', name: '채굴기', kind: 'building', cost: 2, sight: 1, hp: 4, attack: 0, range: 0, production: 1, score: 2, copies: 4, description: '경제의 기본. 광맥 위에서는 생산 +1.' },
  { ...base, id: 'outpost', name: '전초기지', kind: 'building', cost: 3, sight: 2, hp: 6, attack: 0, range: 0, production: 0, score: 3, copies: 3, description: '시야·영토 확장.' },
  { ...base, id: 'turret', name: '방어탑', kind: 'building', cost: 4, sight: 1, hp: 6, attack: 2, range: 2, production: 0, score: 2, copies: 2, description: '고정 방어.' },
  { ...base, id: 'scout', name: '정찰 드론', kind: 'unit', cost: 1, sight: 2, hp: 2, attack: 1, range: 1, production: 0, score: 1, copies: 3, description: '값싼 시야 확장.' },
  { ...base, id: 'fighter', name: '전투기', kind: 'unit', cost: 3, sight: 1, hp: 4, attack: 2, range: 1, production: 0, score: 1, copies: 3, description: '근접 압박.' },
  { ...base, id: 'artillery', name: '포격함', kind: 'unit', cost: 4, sight: 1, hp: 3, attack: 3, range: 3, production: 0, score: 1, copies: 2, description: '긴 사거리, 낮은 체력.' },
  { ...base, id: 'cruiser', name: '순양함', kind: 'unit', cost: 5, sight: 1, hp: 7, attack: 3, range: 2, production: 0, score: 2, copies: 1, description: '중견 전력.' },
  { ...base, id: 'meteor', name: '유성우', kind: 'magic', cost: 3, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 1, effect: { kind: 'damage', amount: 3, radius: 1 }, description: '즉발: 반경 1 적 마커 전부에 피해 3.' },
  { ...base, id: 'shield', name: '차폐막', kind: 'magic', cost: 2, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 1, effect: { kind: 'heal', amount: 3, radius: 1 }, description: '즉발: 반경 1 아군 마커 전부 체력 +3.' },
  { ...base, id: 'energy-cell', name: '에너지 결정', kind: 'magic', cost: 0, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 2, effect: { kind: 'energy', amount: 3 }, description: '즉발: 에너지 +3. 초반 경제 보조.' },
];

/** 10.3 특수 카드 (덱 빌딩에서 종류별 1장 선택) */
export const SPECIAL_CARDS: CardSpec[] = [
  { ...special, id: 'refinery', name: '정제소', kind: 'building', cost: 5, sight: 1, hp: 5, attack: 0, range: 0, production: 3, score: 4, description: '생산 +3.' },
  { ...special, id: 'observatory', name: '관측소', kind: 'building', cost: 4, sight: 3, hp: 4, attack: 0, range: 0, production: 0, score: 3, description: '넓은 시야.' },
  { ...special, id: 'fortress', name: '요새', kind: 'building', cost: 6, sight: 2, hp: 12, attack: 2, range: 2, production: 0, score: 5, description: '튼튼한 방어 거점.' },
  { ...special, id: 'battleship', name: '전함', kind: 'unit', cost: 8, sight: 2, hp: 12, attack: 4, range: 2, production: 0, score: 3, description: '최강 전력.' },
  { ...special, id: 'stealth', name: '스텔스함', kind: 'unit', cost: 5, sight: 1, hp: 4, attack: 3, range: 1, production: 0, score: 1, keywords: ['infiltrate'], description: '침투: 적 마커 거리 1 이내에도 배치 가능.' },
  { ...special, id: 'repair-drone', name: '수리 드론', kind: 'unit', cost: 3, sight: 1, hp: 2, attack: 0, range: 0, production: 0, score: 1, keywords: ['repair'], description: '정비: 내 턴 시작 시(전투 직후) 반경 1 아군 체력 +1.' },
  { ...special, id: 'gravity-wave', name: '중력파', kind: 'magic', cost: 5, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, effect: { kind: 'damage', amount: 2, radius: 2 }, description: '즉발: 반경 2 적 마커 전부에 피해 2.' },
  { ...special, id: 'warp-gate', name: '워프 게이트', kind: 'magic', cost: 3, sight: 3, hp: 2, attack: 0, range: 0, production: 0, score: 0, effect: { kind: 'persistent', durationTurns: 3 }, description: '지속 3턴: 시야 3 제공. 파괴 가능.' },
  { ...special, id: 'energy-storm', name: '에너지 폭풍', kind: 'magic', cost: 2, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, effect: { kind: 'energy', amount: 6 }, description: '즉발: 에너지 +6.' },
];

/** 모든 카드 + 코어 */
export const ALL_SPECS: CardSpec[] = [CORE_SPEC, ...BASE_CARDS, ...SPECIAL_CARDS];

const SPEC_BY_ID: Record<CardId, CardSpec> = Object.fromEntries(ALL_SPECS.map((s) => [s.id, s]));

export function getSpec(id: CardId): CardSpec {
  const spec = SPEC_BY_ID[id];
  if (!spec) throw new Error(`알 수 없는 카드: ${id}`);
  return spec;
}

export function hasSpec(id: CardId): boolean {
  return id in SPEC_BY_ID;
}

/** 기본 덱 20장을 카드 id 배열로 펼친 것 (셔플 전 순서) */
export const BASE_DECK: CardId[] = BASE_CARDS.flatMap((c) => Array<CardId>(c.copies).fill(c.id));

if (BASE_DECK.length !== BASE_DECK_SIZE) {
  throw new Error(`기본 덱 장수 불일치: ${BASE_DECK.length} !== ${BASE_DECK_SIZE}`);
}

export function specialCardsOf(type: CardType): CardSpec[] {
  return SPECIAL_CARDS.filter((c) => c.kind === type);
}

/** 덱 빌딩을 건너뛸 때(AI 좌석, 테스트) 쓰는 기본 선택: 종류별 첫 번째 특수 카드 */
export const DEFAULT_DECK_CHOICE: DeckChoice = {
  buildingId: 'refinery',
  unitId: 'battleship',
  magicId: 'gravity-wave',
};

/** 덱 선택이 종류별 특수 카드 하나씩인지 검사한다 */
export function isValidDeckChoice(choice: DeckChoice): boolean {
  const ok = (id: CardId, type: CardType) => hasSpec(id) && getSpec(id).special && getSpec(id).kind === type;
  return ok(choice.buildingId, 'building') && ok(choice.unitId, 'unit') && ok(choice.magicId, 'magic');
}

/** 기본 20 + 특수 3 = 23장 (셔플 전) */
export function buildDeck(choice: DeckChoice): CardId[] {
  const picks = [choice.buildingId, choice.unitId, choice.magicId];
  if (picks.length !== SPECIAL_PICKS) throw new Error(`특수 카드 수 불일치: ${picks.length} !== ${SPECIAL_PICKS}`);
  return [...BASE_DECK, ...picks];
}

export const DECK_SIZE = BASE_DECK_SIZE + SPECIAL_PICKS;
