/**
 * 카드 기준표 (Rules.md 10절). 수치는 이 파일에만 둔다.
 * 종족 5개(coalition/swarm/automata/shade/siege)가 완전히 다른 기본 카드 22종 + 특수 카드 풀 9종을 쓴다.
 * 2026-09-24부터 덱 빌딩(자유 선택)은 없다 — 종족을 고르면 `fixedDeckOf`가 정한 고정 25장을 그대로
 * 쓴다(Rules.md 10.7절). "기본/특수" 구분은 카탈로그 분류로만 남는다.
 * Rules.md 표와 일치하는지 data.test.ts 가 검증한다.
 */
import type { CardId, CardSpec, CardType, RaceDef, RaceId } from '../types/index.js';
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
  { id: 'shade', name: '그림자 결사', concept: '은신과 침투로 허를 찌르는 기습전' },
  { id: 'siege', name: '노바 포병단', concept: '긴 사거리와 다중 포격으로 압박하는 화력전' },
];

// ---------------------------------------------------------------------------
// 인류 연합 (coalition) — 기존 카드 그대로 유지 (엔진 테스트 다수가 이 수치를 직접 검증한다)
// ---------------------------------------------------------------------------

const coalitionBase = baseOf('coalition');
const coalitionSpecial = specialOf('coalition');

export const COALITION_BASE_CARDS: CardSpec[] = [
  { ...coalitionBase, id: 'extractor', name: '채굴기', kind: 'building', cost: 2, sight: 1, hp: 4, attack: 0, range: 0, production: 1, score: 2, copies: 4, description: '경제의 기본. 광맥 위에서는 생산 +1.' },
  { ...coalitionBase, id: 'outpost', name: '전초기지', kind: 'building', cost: 3, sight: 2, hp: 7, attack: 0, range: 0, production: 0, score: 3, copies: 3, description: '시야·영토 확장.' },
  { ...coalitionBase, id: 'turret', name: '방어탑', kind: 'building', cost: 4, sight: 1, hp: 6, attack: 3, range: 2, production: 0, score: 2, copies: 2, description: '고정 방어.' },
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
  { ...swarmBase, id: 'larva-nest', name: '알집', kind: 'building', cost: 1, sight: 1, hp: 4, attack: 0, range: 0, production: 1, score: 1, copies: 3, description: '가장 싼 경제 건물. 광맥 위에서는 생산 +1.' },
  { ...swarmBase, id: 'bio-spire', name: '생체첨탑', kind: 'building', cost: 3, sight: 2, hp: 5, attack: 0, range: 0, production: 0, score: 3, copies: 3, description: '시야·영토 확장.' },
  { ...swarmBase, id: 'spike-turret', name: '가시탑', kind: 'building', cost: 4, sight: 1, hp: 5, attack: 3, range: 1, production: 0, score: 2, copies: 1, description: '근접 방어. 사거리는 짧지만 공격력이 높다.' },
  { ...swarmBase, id: 'drone', name: '유충병', kind: 'unit', cost: 1, sight: 1, hp: 3, attack: 1, range: 1, production: 0, score: 1, copies: 3, keywords: ['infiltrate'], description: '가장 싼 공격 유닛. 침투: 적 마커 거리 1 이내에도 배치 가능.' },
  { ...swarmBase, id: 'stalker', name: '추적자', kind: 'unit', cost: 2, sight: 1, hp: 4, attack: 2, range: 1, production: 0, score: 1, copies: 5, keywords: ['infiltrate'], description: '군락의 주력. 침투: 적 마커 거리 1 이내에도 배치 가능.' },
  { ...swarmBase, id: 'spitter', name: '산성분사체', kind: 'unit', cost: 3, sight: 1, hp: 4, attack: 2, range: 2, production: 0, score: 1, copies: 2, keywords: ['infiltrate'], description: '값싼 사거리 압박. 침투: 적 마커 거리 1 이내에도 배치 가능.' },
  { ...swarmBase, id: 'brood-queen', name: '산란여왕', kind: 'unit', cost: 5, sight: 1, hp: 7, attack: 2, range: 1, production: 0, score: 2, copies: 1, keywords: ['repair'], description: '군락에서 가장 비싼 유닛. 정비: 내 턴을 끝낼 때 반경 1 아군 체력 +1.' },
  { ...swarmBase, id: 'acid-spray', name: '산성 포자', kind: 'magic', cost: 2, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 2, effect: { kind: 'damage', amount: 3, radius: 1 }, description: '즉발: 반경 1 적 마커 전부에 피해 3.' },
  { ...swarmBase, id: 'swarm-call', name: '소집 신호', kind: 'magic', cost: 0, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 1, effect: { kind: 'energy', amount: 2 }, description: '즉발: 에너지 +2.' },
  { ...swarmBase, id: 'frenzy', name: '광란', kind: 'magic', cost: 1, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 1, effect: { kind: 'heal', amount: 3, radius: 1 }, description: '즉발: 반경 1 아군 마커 전부 체력 +3.' },
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
  { ...automataBase, id: 'fab-node', name: '제작 노드', kind: 'building', cost: 3, sight: 1, hp: 7, attack: 0, range: 0, production: 1, score: 3, copies: 3, keywords: ['overclock'], description: '경제의 기본. 과부하: 반경 1 이내 자신 건물 수만큼 생산 추가.' },
  { ...automataBase, id: 'sentry-pylon', name: '감시 첨탑', kind: 'building', cost: 4, sight: 3, hp: 5, attack: 0, range: 0, production: 0, score: 3, copies: 2, description: '넓은 시야.' },
  { ...automataBase, id: 'bastion', name: '보루', kind: 'building', cost: 4, sight: 1, hp: 10, attack: 2, range: 2, production: 0, score: 3, copies: 2, description: '튼튼한 고정 방어.' },
  { ...automataBase, id: 'probe', name: '정찰 유닛', kind: 'unit', cost: 1, sight: 2, hp: 2, attack: 0, range: 0, production: 0, score: 1, copies: 4, description: '공격력이 없는 순수 정찰용. 군락과 달리 초반 공세 수단이 없다.' },
  { ...automataBase, id: 'sentinel', name: '파수병', kind: 'unit', cost: 4, sight: 1, hp: 6, attack: 2, range: 1, production: 0, score: 1, copies: 3, description: '기본 전투 유닛. 다른 종족보다 값이 비싸다.' },
  { ...automataBase, id: 'railgun-frame', name: '레일건 유닛', kind: 'unit', cost: 5, sight: 1, hp: 5, attack: 4, range: 3, production: 0, score: 2, copies: 2, description: '긴 사거리, 높은 화력.' },
  { ...automataBase, id: 'dreadnought-core', name: '드레드노트 코어', kind: 'unit', cost: 5, sight: 1, hp: 10, attack: 3, range: 2, production: 0, score: 3, copies: 1, description: '기본 덱에서 가장 강한 유닛.' },
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
// 그림자 결사 (shade) — 은신과 기습. 체력이 낮은 대신 `은신`·`침투`로 표적을 피하거나 적진에 파고든다
// ---------------------------------------------------------------------------

const shadeBase = baseOf('shade');
const shadeSpecial = specialOf('shade');

export const SHADE_BASE_CARDS: CardSpec[] = [
  { ...shadeBase, id: 'null-collector', name: '널 수집기', kind: 'building', cost: 2, sight: 1, hp: 4, attack: 0, range: 0, production: 1, score: 2, copies: 4, description: '경제의 기본. 광맥 위에서는 생산 +1.' },
  { ...shadeBase, id: 'dead-relay', name: '사구 중계소', kind: 'building', cost: 3, sight: 2, hp: 6, attack: 0, range: 0, production: 0, score: 3, copies: 3, description: '시야·영토 확장.' },
  { ...shadeBase, id: 'ambush-node', name: '매복 첨탑', kind: 'building', cost: 4, sight: 1, hp: 5, attack: 2, range: 2, production: 0, score: 2, copies: 2, keywords: ['veil'], description: '은신: 다른 적 표적이 남아 있으면 공격받지 않는 고정 방어.' },
  { ...shadeBase, id: 'wisp', name: '환영체', kind: 'unit', cost: 1, sight: 2, hp: 2, attack: 1, range: 1, production: 0, score: 1, copies: 3, keywords: ['veil'], description: '가장 싼 유닛. 은신: 다른 표적이 있으면 안 맞는다.' },
  { ...shadeBase, id: 'shade-blade', name: '그림자 검사', kind: 'unit', cost: 2, sight: 1, hp: 3, attack: 2, range: 1, production: 0, score: 1, copies: 3, keywords: ['veil', 'infiltrate'], description: '종족의 주력. 은신 + 침투(적 마커 거리 1 이내에도 배치 가능).' },
  { ...shadeBase, id: 'phase-striker', name: '위상 저격수', kind: 'unit', cost: 3, sight: 1, hp: 3, attack: 3, range: 2, production: 0, score: 1, copies: 2, keywords: ['veil'], description: '은신을 두른 사거리 압박.' },
  { ...shadeBase, id: 'wraith', name: '망령함', kind: 'unit', cost: 5, sight: 1, hp: 5, attack: 3, range: 1, production: 0, score: 2, copies: 1, keywords: ['infiltrate'], description: '침투. 기본 덱에서 가장 비싼 유닛.' },
  { ...shadeBase, id: 'void-burst', name: '공허 폭발', kind: 'magic', cost: 3, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 1, effect: { kind: 'damage', amount: 3, radius: 1 }, description: '즉발: 반경 1 적 마커 전부에 피해 3.' },
  { ...shadeBase, id: 'mirage-field', name: '신기루 결계', kind: 'magic', cost: 2, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 1, effect: { kind: 'heal', amount: 3, radius: 1 }, description: '즉발: 반경 1 아군 마커 전부 체력 +3.' },
  { ...shadeBase, id: 'dark-cell', name: '암흑 결정', kind: 'magic', cost: 0, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 2, effect: { kind: 'energy', amount: 3 }, description: '즉발: 에너지 +3. 초반 경제 보조.' },
];

export const SHADE_SPECIAL_CARDS: CardSpec[] = [
  { ...shadeSpecial, id: 'black-market', name: '암시장', kind: 'building', cost: 5, sight: 1, hp: 5, attack: 0, range: 0, production: 3, score: 4, description: '생산 +3.' },
  { ...shadeSpecial, id: 'veiled-array', name: '은폐 관측망', kind: 'building', cost: 4, sight: 3, hp: 4, attack: 0, range: 0, production: 0, score: 3, description: '넓은 시야.' },
  { ...shadeSpecial, id: 'shroud-bastion', name: '장막 보루', kind: 'building', cost: 6, sight: 2, hp: 11, attack: 3, range: 2, production: 0, score: 5, keywords: ['veil'], description: '은신: 들키지 않는 방어 거점.' },
  { ...shadeSpecial, id: 'nightmare', name: '악몽체', kind: 'unit', cost: 7, sight: 1, hp: 9, attack: 4, range: 1, production: 0, score: 3, keywords: ['veil', 'infiltrate'], description: '종족에서 가장 강한 개체. 은신 + 침투.' },
  { ...shadeSpecial, id: 'phantom-agent', name: '유령 요원', kind: 'unit', cost: 5, sight: 1, hp: 3, attack: 3, range: 1, production: 0, score: 1, keywords: ['infiltrate'], description: '침투: 적 마커 거리 1 이내에도 배치 가능.' },
  { ...shadeSpecial, id: 'medic-wisp', name: '치유 환영', kind: 'unit', cost: 3, sight: 1, hp: 2, attack: 0, range: 0, production: 0, score: 1, keywords: ['repair'], description: '정비: 내 턴을 끝낼 때 반경 1 아군 체력 +1.' },
  { ...shadeSpecial, id: 'eclipse-wave', name: '월식파', kind: 'magic', cost: 5, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, effect: { kind: 'damage', amount: 2, radius: 2 }, description: '즉발: 반경 2 적 마커 전부에 피해 2.' },
  { ...shadeSpecial, id: 'false-signal', name: '허상 신호', kind: 'magic', cost: 3, sight: 3, hp: 2, attack: 0, range: 0, production: 0, score: 0, effect: { kind: 'persistent', durationTurns: 3 }, description: '지속 3턴: 시야 3 제공. 파괴 가능.' },
  { ...shadeSpecial, id: 'entropy-surge', name: '엔트로피 폭증', kind: 'magic', cost: 2, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, effect: { kind: 'energy', amount: 6 }, description: '즉발: 에너지 +6.' },
];

// ---------------------------------------------------------------------------
// 노바 포병단 (siege) — 사거리와 포격. 체력이 낮은 대신 사거리가 길고 `다중 포격`으로 둘을 동시에 때린다
// ---------------------------------------------------------------------------

const siegeBase = baseOf('siege');
const siegeSpecial = specialOf('siege');

export const SIEGE_BASE_CARDS: CardSpec[] = [
  { ...siegeBase, id: 'strip-mine', name: '궤도 채굴장', kind: 'building', cost: 2, sight: 1, hp: 4, attack: 0, range: 0, production: 1, score: 2, copies: 4, description: '경제의 기본. 광맥 위에서는 생산 +1.' },
  { ...siegeBase, id: 'relay-spire', name: '중계 첨탑', kind: 'building', cost: 3, sight: 2, hp: 6, attack: 0, range: 0, production: 0, score: 3, copies: 3, description: '시야·영토 확장.' },
  { ...siegeBase, id: 'flak-tower', name: '대공 포탑', kind: 'building', cost: 4, sight: 1, hp: 6, attack: 3, range: 3, production: 0, score: 2, copies: 2, description: '고정 방어. 사거리가 인류 연합 방어탑보다 길다.' },
  { ...siegeBase, id: 'spotter', name: '관측병', kind: 'unit', cost: 1, sight: 3, hp: 2, attack: 0, range: 0, production: 0, score: 1, copies: 3, description: '공격력 대신 아주 넓은 시야를 가진 정찰용.' },
  { ...siegeBase, id: 'gunner', name: '포병', kind: 'unit', cost: 3, sight: 1, hp: 3, attack: 2, range: 3, production: 0, score: 1, copies: 3, description: '값싼 사거리 압박.' },
  { ...siegeBase, id: 'howitzer', name: '곡사포', kind: 'unit', cost: 5, sight: 1, hp: 4, attack: 2, range: 3, production: 0, score: 1, copies: 2, keywords: ['barrage'], description: '다중 포격: 주 표적 외 다음 순위 적에도 동시 피해. 긴 사거리, 낮은 체력.' },
  { ...siegeBase, id: 'dreadshell', name: '포격순양함', kind: 'unit', cost: 6, sight: 1, hp: 8, attack: 3, range: 2, production: 0, score: 3, copies: 1, keywords: ['barrage'], description: '다중 포격. 기본 덱에서 가장 강한 유닛.' },
  { ...siegeBase, id: 'orbital-strike', name: '궤도 타격', kind: 'magic', cost: 3, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 1, effect: { kind: 'damage', amount: 3, radius: 1 }, description: '즉발: 반경 1 적 마커 전부에 피해 3.' },
  { ...siegeBase, id: 'repair-field', name: '수리장', kind: 'magic', cost: 2, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 1, effect: { kind: 'heal', amount: 3, radius: 1 }, description: '즉발: 반경 1 아군 마커 전부 체력 +3.' },
  { ...siegeBase, id: 'charge-cell', name: '충전 결정', kind: 'magic', cost: 0, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, copies: 2, effect: { kind: 'energy', amount: 3 }, description: '즉발: 에너지 +3. 초반 경제 보조.' },
];

export const SIEGE_SPECIAL_CARDS: CardSpec[] = [
  { ...siegeSpecial, id: 'heavy-foundry', name: '중장비 공창', kind: 'building', cost: 5, sight: 1, hp: 5, attack: 0, range: 0, production: 3, score: 4, description: '생산 +3.' },
  { ...siegeSpecial, id: 'far-scope', name: '원거리 관측소', kind: 'building', cost: 4, sight: 4, hp: 4, attack: 0, range: 0, production: 0, score: 3, description: '아주 넓은 시야.' },
  { ...siegeSpecial, id: 'siege-bastion', name: '공성 보루', kind: 'building', cost: 6, sight: 2, hp: 10, attack: 4, range: 4, production: 0, score: 5, keywords: ['barrage'], description: '다중 포격을 가진 방어 거점.' },
  { ...siegeSpecial, id: 'titan-cannon', name: '타이탄 대포', kind: 'unit', cost: 8, sight: 2, hp: 10, attack: 5, range: 4, production: 0, score: 4, keywords: ['barrage'], description: '종족에서 가장 강한 개체. 다중 포격.' },
  { ...siegeSpecial, id: 'saboteur', name: '침투 관측병', kind: 'unit', cost: 5, sight: 1, hp: 4, attack: 3, range: 2, production: 0, score: 1, keywords: ['infiltrate'], description: '침투: 적 마커 거리 1 이내에도 배치 가능.' },
  { ...siegeSpecial, id: 'field-medic', name: '야전 정비병', kind: 'unit', cost: 3, sight: 1, hp: 2, attack: 0, range: 0, production: 0, score: 1, keywords: ['repair'], description: '정비: 내 턴을 끝낼 때 반경 1 아군 체력 +1.' },
  { ...siegeSpecial, id: 'barrage-shell', name: '포화탄', kind: 'magic', cost: 6, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, effect: { kind: 'damage', amount: 3, radius: 2 }, description: '즉발: 반경 2 적 마커 전부에 피해 3.' },
  { ...siegeSpecial, id: 'designator-beacon', name: '표적 지시기', kind: 'magic', cost: 4, sight: 4, hp: 3, attack: 0, range: 0, production: 0, score: 0, effect: { kind: 'persistent', durationTurns: 3 }, description: '지속 3턴: 시야 4 제공. 파괴 가능.' },
  { ...siegeSpecial, id: 'overcharge-round', name: '과충전탄', kind: 'magic', cost: 3, sight: 0, hp: 0, attack: 0, range: 0, production: 0, score: 0, effect: { kind: 'energy', amount: 7 }, description: '즉발: 에너지 +7.' },
];

// ---------------------------------------------------------------------------
// 종족별 조회 테이블
// ---------------------------------------------------------------------------

export const BASE_CARDS_BY_RACE: Record<RaceId, CardSpec[]> = {
  coalition: COALITION_BASE_CARDS,
  swarm: SWARM_BASE_CARDS,
  automata: AUTOMATA_BASE_CARDS,
  shade: SHADE_BASE_CARDS,
  siege: SIEGE_BASE_CARDS,
};

export const SPECIAL_CARDS_BY_RACE: Record<RaceId, CardSpec[]> = {
  coalition: COALITION_SPECIAL_CARDS,
  swarm: SWARM_SPECIAL_CARDS,
  automata: AUTOMATA_SPECIAL_CARDS,
  shade: SHADE_SPECIAL_CARDS,
  siege: SIEGE_SPECIAL_CARDS,
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

/** 종족의 카드 전체(기본 + 특수, 구분 없이) — 종족 선택 화면의 카드 도감 미리보기에 쓴다 */
export function cardPoolOf(race: RaceId): CardSpec[] {
  return [...BASE_CARDS_BY_RACE[race], ...SPECIAL_CARDS_BY_RACE[race]];
}

/**
 * 종족별 고정 덱 (Rules.md 10.7절, 2026-09-24 자유 선택 폐지). 기본 22장 전부 + 특수 카드 중
 * 건물 1·유닛 1·마법 1 = 25장(DECK_SIZE). 특수 3장은 전 종족에서 경제·생존·에너지 보조 카드로만
 * 골라(가장 강한 카드 제외) 종족 간 격차가 기본 22장의 정체성에서만 나오게 했다.
 * 예외 둘: `coalition`은 2026-09-23 이전부터 쓰던 기본값(`battleship` 포함)을 그대로 고정했고,
 * `swarm`은 2026-09-24에 유닛 특수를 종족 최강 유닛 `alpha-brood`로 올렸다가, 2026-09-30에 초반 유닛을
 * 튼튼하게 고치면서 다시 필러 `nurse-drone`으로 되돌렸다 (자세한 근거는 Rules.md 10.7절).
 */
function fixed(race: RaceId, fillers: { building: CardId; unit: CardId; magic: CardId }): [RaceId, Record<CardId, number>] {
  const cards: Record<CardId, number> = Object.fromEntries(BASE_CARDS_BY_RACE[race].map((c) => [c.id, c.copies]));
  cards[fillers.building] = (cards[fillers.building] ?? 0) + 1;
  cards[fillers.unit] = (cards[fillers.unit] ?? 0) + 1;
  cards[fillers.magic] = (cards[fillers.magic] ?? 0) + 1;
  return [race, cards];
}

export const FIXED_DECKS: Record<RaceId, Record<CardId, number>> = Object.fromEntries([
  fixed('coalition', { building: 'refinery', unit: 'battleship', magic: 'gravity-wave' }),
  fixed('swarm', { building: 'chitin-refinery', unit: 'nurse-drone', magic: 'overgrowth' }),
  fixed('automata', { building: 'deep-scanner', unit: 'repair-node', magic: 'core-surge' }),
  fixed('shade', { building: 'black-market', unit: 'medic-wisp', magic: 'entropy-surge' }),
  fixed('siege', { building: 'heavy-foundry', unit: 'field-medic', magic: 'overcharge-round' }),
]) as Record<RaceId, Record<CardId, number>>;

for (const race of RACES) {
  const deck = FIXED_DECKS[race.id];
  const total = Object.values(deck).reduce((a, b) => a + b, 0);
  if (total !== DECK_SIZE) throw new Error(`${race.id} 고정 덱 장수 불일치: ${total} !== ${DECK_SIZE}`);
  // fixed() 는 필러 id 오타(다른 종족 카드 혼입)를 잡지 못한다 — 장수 합만으로는 드러나지 않으므로
  // 여기서 카드 소속 종족을 명시적으로 검사해 모듈 로드 시 즉시 실패하게 한다(rules-engine-reviewer 지적).
  for (const id of Object.keys(deck)) {
    if (getSpec(id).race !== race.id) {
      throw new Error(`${race.id} 고정 덱에 다른 종족 카드가 섞여 있습니다: ${id} (${getSpec(id).race})`);
    }
  }
}

/** 종족의 고정 덱을 카드 id 배열로 펼친 것 (셔플 전 순서) */
export function buildDeck(race: RaceId): CardId[] {
  const out: CardId[] = [];
  for (const [id, n] of Object.entries(FIXED_DECKS[race])) out.push(...Array<CardId>(n).fill(id));
  return out;
}
