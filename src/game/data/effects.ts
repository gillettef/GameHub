import type { CardEffect } from '../types';

/**
 * 시설 특수효과 — 원본 카드(notes/놀이공원_v1.xlsx)의 효과 문구를 게임에 있는 개념
 * (이벤트 태그·관객 취향·어린이/성인·패시브)으로 재해석한 구현 규칙. 원문은 FacilityCard.effect / docs/cards.md.
 * 원본의 "+N 자원"은 구현 수익 스케일(원본 ÷ CFG.incomeDiv, 올림)에 맞춰 줄였다. 같은 수치인데 비싼 카드는 효과로 차별화했다.
 * 이벤트 태그: sunny 맑음·여름 / badWeather 비·눈 / family 가족의 날·어린이날 / horror 할로윈 / summer 여름 물놀이
 * festival 할로윈·봄 축제·가수 공연 / special 봄 축제·인플루언서·할인 쿠폰 / explore 탐험 주간 / learn 과학의 날
 * kids 어린이날 / night 가수 공연·불꽃놀이 / blackout 정전 / mess 쓰레기 대란
 */
export const EFFECTS: Record<number, CardEffect> = {
  // 스릴형
  1: { text: '악천후(비·눈) 유지비 +2 · 야간 이벤트 수익 +2', upkeepOn: { tag: 'badWeather', n: 2 }, on: [{ tag: 'night', income: 2 }] },
  2: { text: '스릴형을 좋아하는 관객 만족도 +2', favSat: 2 },
  3: { text: '야간 이벤트 수익 +2', on: [{ tag: 'night', income: 2 }] },
  4: { text: '스릴형을 좋아하는 관객 만족도 +2', favSat: 2 },
  // 패밀리형
  5: { text: '가족 이벤트 만족도 +2', on: [{ tag: 'family', sat: 2 }] },
  6: { text: '어린이 관객 만족도 +1', childSat: 1 },
  7: { text: '가족 이벤트 만족도 +1', on: [{ tag: 'family', sat: 1 }] },
  8: { text: '어린이 관객 만족도 +1 · 가족 이벤트 만족도 +1', childSat: 1, on: [{ tag: 'family', sat: 1 }] },
  // 공포형
  9: { text: '할로윈 이벤트 수익 +2 (이벤트 보너스와 합쳐 2배)', on: [{ tag: 'horror', income: 2 }] },
  10: { text: '할로윈 이벤트 만족도 +3 · 공포형을 좋아하는 관객 만족도 +1', on: [{ tag: 'horror', sat: 3 }], favSat: 1 },
  11: { text: '악천후(비·눈) 수익 +1', on: [{ tag: 'badWeather', income: 1 }] },
  12: { text: '축제 이벤트 만족도 +2 · 공포형을 좋아하는 관객 만족도 +1', on: [{ tag: 'festival', sat: 2 }], favSat: 1 },
  // 어드벤처형
  13: { text: '탐험 이벤트 수익 +2', on: [{ tag: 'explore', income: 2 }] },
  14: { text: '탐험 이벤트 수익 +1', on: [{ tag: 'explore', income: 1 }] },
  15: { text: '탐험 이벤트 만족도 +3 · 어드벤처형을 좋아하는 관객 만족도 +2', on: [{ tag: 'explore', sat: 3 }], favSat: 2 },
  16: { text: '여름 이벤트 수익 +2 · 어드벤처형을 좋아하는 관객 만족도 +2', on: [{ tag: 'summer', income: 2 }], favSat: 2 },
  // 교육형
  17: { text: '학습 이벤트 수익 +1 · 어린이 관객 만족도 +1', on: [{ tag: 'learn', income: 1 }], childSat: 1 },
  18: { text: '학습 이벤트 만족도 +3', on: [{ tag: 'learn', sat: 3 }] },
  19: { text: '어린이 이벤트 수익 +2 · 어린이 관객 만족도 +1', on: [{ tag: 'kids', income: 2 }], childSat: 1 },
  20: { text: '축제 이벤트 수익 +1 · 성인 관객 만족도 +1', on: [{ tag: 'festival', income: 1 }], adultSat: 1 },
  // 물놀이형
  21: { text: '여름 이벤트 수익 +2', on: [{ tag: 'summer', income: 2 }] },
  22: { text: '여름 이벤트 수익 +2 · 맑은 날 수익 +1', on: [{ tag: 'summer', income: 2 }, { tag: 'sunny', income: 1 }] },
  23: { text: '여름 이벤트 만족도 +3 · 물놀이형을 좋아하는 관객 만족도 +2', on: [{ tag: 'summer', sat: 3 }], favSat: 2 },
  24: { text: '여름 이벤트 수익 +2', on: [{ tag: 'summer', income: 2 }] },
  // 놀이형 (같은 수치 카드는 비쌀수록 효과가 좋다)
  25: { text: '어린이 관객 만족도 +1 · 어린이 이벤트 만족도 +2', childSat: 1, on: [{ tag: 'kids', sat: 2 }] },
  26: { text: '효과 없음 (기본 놀이기구)' },
  27: { text: '탐험 이벤트 만족도 +2', on: [{ tag: 'explore', sat: 2 }] },
  28: { text: '튼튼한 기구: 고장 나지 않음 · 어린이 관객 만족도 +1', noBreak: true, childSat: 1 },
  29: { text: '어린이 이벤트 만족도 +2', on: [{ tag: 'kids', sat: 2 }] },
  30: { text: '놀이형을 좋아하는 관객 만족도 +2 · 야간 이벤트 수익 +1', favSat: 2, on: [{ tag: 'night', income: 1 }] },
  // 상점
  31: { text: '축제 이벤트 수익 +2', on: [{ tag: 'festival', income: 2 }] },
  32: { text: '야간 이벤트 수익 +2', on: [{ tag: 'night', income: 2 }] },
  33: { text: '축제 이벤트 수익 +1', on: [{ tag: 'festival', income: 1 }] },
  34: { text: '어린이 관객 만족도 +1 · 어린이 이벤트 만족도 +2', childSat: 1, on: [{ tag: 'kids', sat: 2 }] },
  35: { text: '맑은 날 수익 +2', on: [{ tag: 'sunny', income: 2 }] },
  // 부대시설 — 상점처럼 놀이기구 2곳과 별도로 들르는 시설. 패시브는 이용 여부와 무관하게 적용
  36: { text: '입장한 관객 1명당 만족도 +1', perChild: 1, perAdult: 1 },
  37: { text: '관리 단계 무료 청소 +2 · 매 라운드 만족도 +1', freeClean: 2, flatSat: 1 },
  38: { text: '특별 이벤트(봄 축제·인플루언서·할인 쿠폰) 수익 +2 · 매 라운드 만족도 +2', on: [{ tag: 'special', income: 2 }], flatSat: 2 },
  39: { text: '입장한 어린이 1명당 만족도 +1', perChild: 1 },
  40: { text: '입장한 성인 1명당 만족도 +1', perAdult: 1 },
  41: { text: '관리 단계 무료 수리 +1 · 매 라운드 만족도 +1', freeRepair: 1, flatSat: 1 },
  42: { text: '정전 때 내 공원 시설이 고장 나지 않음', blackoutImmune: true },
  43: { text: '야간 이벤트 수익 +2', on: [{ tag: 'night', income: 2 }] },
  44: { text: '학습·축제 이벤트 수익 +1 · 매 라운드 만족도 +1', on: [{ tag: 'learn', income: 1 }, { tag: 'festival', income: 1 }], flatSat: 1 },
  45: { text: '포토존: 매 라운드 만족도 +4', flatSat: 4 },
  46: { text: '맑은 날·축제 이벤트 만족도 +3 · 매 라운드 만족도 +2', on: [{ tag: 'sunny', sat: 3 }, { tag: 'festival', sat: 3 }], flatSat: 2 },
  47: { text: '입장 관객 4명 이상이면 수익 +$2', crowdIncome: { min: 4, income: 2 } },
  48: { text: '맑은 날 수익 +2 · 매 라운드 만족도 +2', on: [{ tag: 'sunny', income: 2 }], flatSat: 2 },
  49: { text: '매 라운드 만족도 +3', flatSat: 3 },
  50: { text: '매 라운드 만족도 +2 · 관리 단계 무료 청소 +1', flatSat: 2, freeClean: 1 },
};

export const effectOf = (id: number): CardEffect => EFFECTS[id] ?? { text: '' };
