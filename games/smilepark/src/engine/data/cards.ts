import { FACILITIES } from './facilities';
import type { CardEffect, CardKind, FacilityCard, FacilityType, ParkCard, RideTarget } from '../types';

/**
 * 카드 인쇄값 — 원본 xlsx 수치를 v1 규칙(docs/design-v1.md)의 "카드에 그대로 적히는 숫자"로 한 번 변환한다.
 * 플레이어는 이 값만 보고 계산하며, 변환 규칙은 여기에만 있다. (원본 notes/ xlsx는 수정하지 않는다)
 */
export const PRINT = {
  /** 건설비 하한 */
  minCost: 2,
  /** 정원: [원본 건설비 하한, 정원] 위에서부터 처음 맞는 것, 없으면 rideCapMin */
  capTiers: [[7, 4], [3, 3]] as [number, number][],
  rideCapMin: 2,
  /** 어린이/성인 원본 만족도 차이가 이 값 이상이면 그쪽 전용 놀이기구 */
  targetGap: 3,
  /** 1명당 만족도: 전용 놀이기구 / 모두 */
  satTargeted: 3,
  satAll: 2,
  /** 상점: 입장 그룹 1개당 수익 */
  shopIncome: 2,
};

export const OUTDOOR: FacilityType[] = ['스릴형', '패밀리형', '어드벤처형', '물놀이형', '놀이형'];

/**
 * 시설 특수효과 — 원본 카드 문구를 v1 개념(이벤트 아이콘·취향·그룹 구성·고정 효과)으로 재해석.
 * 놀이기구: 그룹 1개 배치마다 / 상점: 매 라운드(그룹이 입장했을 때) / 부대시설: 매 라운드.
 */
export const EFFECTS: Record<number, CardEffect> = {
  // 스릴형
  1: { text: '악천후 때 유지비 +$2 · 야간 때 만족도 +2', upkeepOn: { tag: 'badWeather', n: 2 }, on: [{ tag: 'night', sat: 2 }] },
  2: { text: '취향 일치 보너스 +2 추가', favSat: 2 },
  3: { text: '야간 때 만족도 +2', on: [{ tag: 'night', sat: 2 }] },
  4: { text: '취향 일치 보너스 +2 추가', favSat: 2 },
  // 패밀리형
  5: { text: '가족 이벤트 때 만족도 +2', on: [{ tag: 'family', sat: 2 }] },
  6: { text: '어린이·성인이 함께 온 그룹 만족도 +2', mixedSat: 2 },
  7: { text: '어린이·성인이 함께 온 그룹 만족도 +2', mixedSat: 2 },
  8: { text: '어린이·성인이 함께 온 그룹 만족도 +1 · 가족 이벤트 때 +1', mixedSat: 1, on: [{ tag: 'family', sat: 1 }] },
  // 공포형
  9: { text: '할로윈 때 만족도 +2', on: [{ tag: 'horror', sat: 2 }] },
  10: { text: '축제 때 만족도 +2', on: [{ tag: 'festival', sat: 2 }] },
  11: { text: '악천후 때 만족도 +2', on: [{ tag: 'badWeather', sat: 2 }] },
  12: { text: '취향 일치 보너스 +2 추가', favSat: 2 },
  // 어드벤처형
  13: { text: '탐험 이벤트 때 만족도 +2', on: [{ tag: 'explore', sat: 2 }] },
  14: { text: '어린이가 있는 그룹 만족도 +1', kidSat: 1 },
  15: { text: '취향 일치 보너스 +2 추가', favSat: 2 },
  16: { text: '맑음 때 만족도 +2', on: [{ tag: 'sunny', sat: 2 }] },
  // 교육형
  17: { text: '학습 이벤트 때 만족도 +2', on: [{ tag: 'learn', sat: 2 }] },
  18: { text: '어린이가 있는 그룹 만족도 +1', kidSat: 1 },
  19: { text: '가족 이벤트 때 만족도 +2', on: [{ tag: 'family', sat: 2 }] },
  20: { text: '축제 때 만족도 +2', on: [{ tag: 'festival', sat: 2 }] },
  // 물놀이형
  21: { text: '맑음 때 만족도 +2', on: [{ tag: 'sunny', sat: 2 }] },
  22: { text: '여름 이벤트 때 만족도 +3', on: [{ tag: 'summer', sat: 3 }] },
  23: { text: '취향 일치 보너스 +2 추가', favSat: 2 },
  24: { text: '맑음 때 만족도 +1', on: [{ tag: 'sunny', sat: 1 }] },
  // 놀이형
  25: { text: '어린이날 때 만족도 +2', on: [{ tag: 'kids', sat: 2 }] },
  26: { text: '효과 없음 (기본 놀이기구)' },
  27: { text: '탐험 이벤트 때 만족도 +2', on: [{ tag: 'explore', sat: 2 }] },
  28: { text: '튼튼한 기구: 수리 토큰을 받지 않음', noRepair: true },
  29: { text: '취향 일치 보너스 +1 추가', favSat: 1 },
  30: { text: '야간 때 만족도 +2', on: [{ tag: 'night', sat: 2 }] },
  // 상점 (기본: 입장 그룹 1개당 $1)
  31: { text: '축제 때 수익 +$2', shopOn: [{ tag: 'festival', income: 2 }] },
  32: { text: '야간 때 수익 +$2', shopOn: [{ tag: 'night', income: 2 }] },
  33: { text: '입장 그룹이 4개 이상이면 수익 +$2', crowdIncome: { min: 4, income: 2 } },
  34: { text: '어린이날 때 수익 +$2', shopOn: [{ tag: 'kids', income: 2 }] },
  35: { text: '맑음 때 수익 +$2', shopOn: [{ tag: 'sunny', income: 2 }] },
  // 부대시설 (매 라운드, 운영 여부와 무관)
  36: { text: '정원 초과 배치 1회 (안내 직원 1명과 같음)', overflow: 1 },
  37: { text: '매 라운드 만족도 +1 · 관리 단계에 쓰레기 2개 무료 청소', flatSat: 1, freeClean: 2 },
  38: { text: '매 라운드 만족도 +1 · 축제 때 +2 더', flatSat: 1, flatOn: [{ tag: 'festival', sat: 2 }] },
  39: { text: '어린이가 있는 그룹을 배치할 때마다 만족도 +1', kidGroupSat: 1 },
  40: { text: '성인만 있는 그룹을 배치할 때마다 만족도 +1', adultGroupSat: 1 },
  41: { text: '매 라운드 만족도 +1 · 관리 단계에 수리 토큰 1개 무료 제거', flatSat: 1, freeRepair: 1 },
  42: { text: '매 라운드 만족도 +1 · 정전 때 수리 토큰을 받지 않음', flatSat: 1, blackoutImmune: true },
  43: { text: '매 라운드 만족도 +1 · $1', flatSat: 1, flatIncome: 1 },
  44: { text: '매 라운드 만족도 +1 · 학습 이벤트 때 +2 더', flatSat: 1, flatOn: [{ tag: 'learn', sat: 2 }] },
  45: { text: '포토존: 매 라운드 만족도 +2', flatSat: 2 },
  46: { text: '매 라운드 만족도 +1 · 맑음 때 +2 더', flatSat: 1, flatOn: [{ tag: 'sunny', sat: 2 }] },
  47: { text: '주차비: 입장 그룹 1개당 $1', perGroupIncome: 1 },
  48: { text: '매 라운드 만족도 +1 · 맑음 때 $3', flatSat: 1, flatIncomeOn: [{ tag: 'sunny', income: 3 }] },
  49: { text: '매 라운드 만족도 +2', flatSat: 2 },
  50: { text: '매 라운드 만족도 +1 · 관리 단계에 쓰레기 1개 무료 청소', flatSat: 1, freeClean: 1 },
};

const kindOf = (t: FacilityType): CardKind => (t === '상점' ? 'shop' : t === '부대시설' ? 'amenity' : 'ride');

function targetOf(c: FacilityCard): RideTarget {
  const [child, adult] = c.sat;
  if (child - adult >= PRINT.targetGap) return 'child';
  if (adult - child >= PRINT.targetGap) return 'adult';
  return 'all';
}

export function printCard(c: FacilityCard): ParkCard {
  const kind = kindOf(c.type);
  const ride = kind === 'ride';
  const target = ride ? targetOf(c) : 'all';
  return {
    id: c.id,
    type: c.type,
    name: c.name,
    kind,
    cost: Math.max(PRINT.minCost, c.cost),
    upkeep: c.upkeep,
    cap: ride ? (PRINT.capTiers.find(([min]) => c.cost >= min)?.[1] ?? PRINT.rideCapMin) : 0,
    target,
    sat: ride ? (target === 'all' ? PRINT.satAll : PRINT.satTargeted) : 0,
    income: kind === 'shop' ? PRINT.shopIncome : 0,
    outdoor: OUTDOOR.includes(c.type),
    fx: EFFECTS[c.id] ?? { text: '' },
    orig: c.effect,
  };
}

export const CARDS: ParkCard[] = FACILITIES.map(printCard);
export const CARD_BY_ID: Record<number, ParkCard> = Object.fromEntries(CARDS.map((c) => [c.id, c]));
