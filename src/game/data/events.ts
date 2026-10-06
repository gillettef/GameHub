import type { EventCard } from '../types';

/**
 * 운영카드(이벤트) — 라운드 시작 시 1장 공개되어 모든 플레이어에게 적용.
 * 야외 = 스릴형·패밀리형·어드벤처형·물놀이형·놀이형, 실내 = 공포형·교육형·상점·부대시설 (engine.ts OUTDOOR).
 * 수치는 구현 스케일(방문 1회당 $, 만족도). tags는 시설 특수효과(data/effects.ts)가 반응하는 조건.
 */
export const EVENTS: EventCard[] = [
  { id: 1, icon: 'sun', name: '맑은 날씨', tags: ['sunny'], desc: '화창한 날씨! 모든 시설 수익 +1',
    effects: [{ target: 'all', income: 1 }] },
  { id: 2, icon: 'rain', name: '비 오는 날', tags: ['badWeather'], desc: '야외 시설 수익 -1, 실내 시설 수익 +1 (악천후)',
    effects: [{ target: 'outdoor', income: -1 }, { target: 'indoor', income: 1 }] },
  { id: 3, icon: 'family', name: '가족의 날', tags: ['family'], desc: '패밀리형 수익 +2, 만족도 +1',
    effects: [{ target: ['패밀리형'], income: 2, sat: 1 }] },
  { id: 4, icon: 'pumpkin', name: '할로윈 축제', tags: ['horror', 'festival'], desc: '공포형 수익 +2, 만족도 +1',
    effects: [{ target: ['공포형'], income: 2, sat: 1 }] },
  { id: 5, icon: 'wave', name: '여름 물놀이 축제', tags: ['summer', 'sunny'], desc: '물놀이형 수익 +2, 만족도 +1',
    effects: [{ target: ['물놀이형'], income: 2, sat: 1 }] },
  { id: 6, icon: 'flower', name: '봄 축제', tags: ['festival', 'special'], desc: '모든 시설 만족도 +1',
    effects: [{ target: 'all', sat: 1 }] },
  { id: 7, icon: 'camera', name: '인플루언서 방문', tags: ['special'], desc: '모든 공원이 데려올 수 있는 관객 +2명', visitorDelta: 2 },
  { id: 8, icon: 'snow', name: '눈 오는 날', tags: ['badWeather'], desc: '야외 시설 수익 -1 (악천후)',
    effects: [{ target: 'outdoor', income: -1 }] },
  { id: 9, icon: 'bolt', name: '정전 발생', tags: ['blackout'], desc: '운영이 끝난 뒤 모든 공원에서 시설 1곳이 무작위로 고장나요', breakCount: 1 },
  { id: 10, icon: 'trash', name: '쓰레기 대란', tags: ['mess'], desc: '운영이 끝난 뒤 모든 공원에 쓰레기 토큰 +2', trashDelta: 2 },
  { id: 11, icon: 'ticket', name: '할인 쿠폰', tags: ['special'], desc: '데려올 수 있는 관객 +1명, 모든 시설 만족도 +1',
    visitorDelta: 1, effects: [{ target: 'all', sat: 1 }] },
  { id: 12, icon: 'mic', name: '가수 공연', tags: ['festival', 'night'], desc: '데려올 수 있는 관객 +1명, 상점·부대시설 수익 +2',
    visitorDelta: 1, effects: [{ target: ['상점', '부대시설'], income: 2 }] },
  { id: 13, icon: 'sparkle', name: '불꽃놀이 야간 개장', tags: ['night'], desc: '스릴형 수익 +2, 만족도 +1',
    effects: [{ target: ['스릴형'], income: 2, sat: 1 }] },
  { id: 14, icon: 'adventure', name: '탐험 주간', tags: ['explore'], desc: '어드벤처형 수익 +2, 만족도 +1',
    effects: [{ target: ['어드벤처형'], income: 2, sat: 1 }] },
  { id: 15, icon: 'education', name: '과학의 날', tags: ['learn'], desc: '교육형 수익 +2, 만족도 +1',
    effects: [{ target: ['교육형'], income: 2, sat: 1 }] },
  { id: 16, icon: 'playground', name: '어린이날', tags: ['kids', 'family'], desc: '놀이형 수익 +2, 만족도 +1',
    effects: [{ target: ['놀이형'], income: 2, sat: 1 }] },
];
