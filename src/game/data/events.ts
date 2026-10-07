import type { EventCard } from '../types';

/**
 * 운영카드(이벤트) 16장 — 라운드마다 1장 적용, 다음 라운드 카드도 미리 공개한다.
 * 효과는 "아이콘 하나 + 숫자 하나" 수준으로 단순하게. 놀이기구 보정은 그룹 1개 배치당 적용한다.
 * 야외 = 스릴형·패밀리형·어드벤처형·물놀이형·놀이형, 실내 = 공포형·교육형 (data/cards.ts OUTDOOR).
 */
export const EVENTS: EventCard[] = [
  { id: 1, icon: 'sun', name: '맑은 날씨', tags: ['sunny'], desc: '야외 놀이기구 배치마다 만족도 +1',
    rides: [{ target: 'outdoor', sat: 1 }] },
  { id: 2, icon: 'rain', name: '비 오는 날', tags: ['badWeather'], desc: '야외 놀이기구 만족도 -1, 실내 놀이기구 만족도 +1',
    rides: [{ target: 'outdoor', sat: -1 }, { target: 'indoor', sat: 1 }] },
  { id: 3, icon: 'snow', name: '눈 오는 날', tags: ['badWeather'], desc: '야외 놀이기구 만족도 -1, 상점마다 수익 +$1',
    rides: [{ target: 'outdoor', sat: -1 }], shopDelta: 1 },
  { id: 4, icon: 'family', name: '가족의 날', tags: ['family'], desc: '패밀리형 배치마다 만족도 +2',
    rides: [{ target: ['패밀리형'], sat: 2 }] },
  { id: 5, icon: 'pumpkin', name: '할로윈 축제', tags: ['horror', 'festival'], desc: '공포형 배치마다 만족도 +2',
    rides: [{ target: ['공포형'], sat: 2 }] },
  { id: 6, icon: 'wave', name: '여름 물놀이 축제', tags: ['summer', 'sunny'], desc: '물놀이형 배치마다 만족도 +2',
    rides: [{ target: ['물놀이형'], sat: 2 }] },
  { id: 7, icon: 'flower', name: '봄 축제', tags: ['festival'], desc: '모든 놀이기구 배치마다 만족도 +1',
    rides: [{ target: 'all', sat: 1 }] },
  { id: 8, icon: 'camera', name: '인플루언서 방문', tags: [], desc: '모든 공원 관객 모집 +1그룹', groupDelta: 1 },
  { id: 9, icon: 'bolt', name: '정전 발생', tags: [], desc: '라운드 시작 때 모든 공원의 정원이 가장 큰 놀이기구 1곳에 수리 토큰', blackout: true },
  { id: 10, icon: 'trash', name: '쓰레기 대란', tags: [], desc: '운영이 끝나면 모든 공원에 쓰레기 토큰 +2', trashDelta: 2 },
  { id: 11, icon: 'ticket', name: '할인 쿠폰', tags: [], desc: '관객 모집 +1그룹, 이번 라운드 입장료는 최대 $1', groupDelta: 1, maxFee: 1 },
  { id: 12, icon: 'mic', name: '가수 공연', tags: ['festival', 'night'], desc: '상점마다 수익 +$2', shopDelta: 2 },
  { id: 13, icon: 'sparkle', name: '불꽃놀이 야간 개장', tags: ['night'], desc: '스릴형 배치마다 만족도 +2',
    rides: [{ target: ['스릴형'], sat: 2 }] },
  { id: 14, icon: 'adventure', name: '탐험 주간', tags: ['explore'], desc: '어드벤처형 배치마다 만족도 +2',
    rides: [{ target: ['어드벤처형'], sat: 2 }] },
  { id: 15, icon: 'education', name: '과학의 날', tags: ['learn'], desc: '교육형 배치마다 만족도 +2',
    rides: [{ target: ['교육형'], sat: 2 }] },
  { id: 16, icon: 'playground', name: '어린이날', tags: ['kids', 'family'], desc: '놀이형 배치마다 만족도 +2',
    rides: [{ target: ['놀이형'], sat: 2 }] },
];

export const EVENT_BY_ID: Record<number, EventCard> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

/** 이벤트 아이콘 이름 (카드 문구·UI용) */
export const TAG_LABEL: Record<string, string> = {
  sunny: '맑음',
  badWeather: '악천후',
  night: '야간',
  festival: '축제',
  family: '가족',
  horror: '할로윈',
  summer: '여름',
  explore: '탐험',
  learn: '학습',
  kids: '어린이날',
};
