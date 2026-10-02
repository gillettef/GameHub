import type { EventCard } from '../types';

/** 운영카드(이벤트) — 라운드 시작 시 1장 공개되어 모든 플레이어에게 적용 */
export const EVENTS: EventCard[] = [
  { id: 1, icon: 'sun', name: '맑은 날씨', desc: '화창한 날씨! 모든 시설의 수익 +1', effects: [{ target: 'all', income: 1 }] },
  { id: 2, icon: 'rain', name: '비 오는 날', desc: '야외 시설 수익 -1, 실내 시설 수익 +1. 롤러코스터 유지비 +2', badWeather: true,
    effects: [{ target: 'outdoor', income: -1 }, { target: 'indoor', income: 1 }] },
  { id: 3, icon: 'family', name: '가족의 날', desc: '패밀리형 수익 +2, 만족도 +1', effects: [{ target: ['패밀리형'], income: 2, sat: 1 }] },
  { id: 4, icon: 'pumpkin', name: '할로윈 축제', desc: '공포형 수익 +2, 만족도 +1', effects: [{ target: ['공포형'], income: 2, sat: 1 }] },
  { id: 5, icon: 'wave', name: '여름 물놀이 축제', desc: '물놀이형 수익 +2, 만족도 +1', effects: [{ target: ['물놀이형'], income: 2, sat: 1 }] },
  { id: 6, icon: 'flower', name: '봄 축제', desc: '모든 시설 만족도 +1', effects: [{ target: 'all', sat: 1 }] },
  { id: 7, icon: 'camera', name: '인플루언서 방문', desc: '관객 +2명이 찾아옵니다', visitorDelta: 2 },
  { id: 8, icon: 'snow', name: '눈 오는 날', desc: '야외 시설 수익 -1, 실내 시설 수익 +1', badWeather: true,
    effects: [{ target: 'outdoor', income: -1 }, { target: 'indoor', income: 1 }] },
  { id: 9, icon: 'bolt', name: '정전 발생', desc: '모든 공원에서 시설 1곳이 고장납니다', breakCount: 1 },
  { id: 10, icon: 'trash', name: '쓰레기 대란', desc: '모든 공원에 쓰레기 토큰 +2', trashDelta: 2 },
  { id: 11, icon: 'ticket', name: '할인 쿠폰', desc: '관객 +1명, 만족도 +1', visitorDelta: 1, effects: [{ target: 'all', sat: 1 }] },
  { id: 12, icon: 'mic', name: '가수 공연', desc: '관객 +1명, 상점·부대시설 수익 +2', visitorDelta: 1, effects: [{ target: ['상점', '부대시설'], income: 2 }] },
];
