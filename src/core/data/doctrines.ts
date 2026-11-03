// 노선 단계 보상 (Rules.md 8.1). 단계 4 의 즉시 문화는 엔진이 처리
import type { Doctrine, Mods } from '../types';

export const STAGE_MODS: Record<Doctrine, Partial<Mods>[]> = {
  ark: [{}, { health: 1 }, { unitPower: { guard: 1, battery: 1 } }, { command: 1 }, {}],
  symbiont: [{}, { income: { food: 1 } }, { unitPower: { rider: 1 } }, { income: { culture: 1 } }, {}],
  synth: [{}, { sporeCap: 3 }, { unitUpgradeDiscount: 1, raidBonus: 1 }, { defense: 1, researchDiscount: 1 }, {}],
};

export const STAGE_TEXT: Record<Doctrine, string[]> = {
  ark: ['', '건강 +1', '경비대·포대 전력 +1, 습격 납치', '지휘 행동 +1', '즉시 문화 +5'],
  symbiont: ['', '생산 단계 식량 +1', '기동대 전력 +1, 유도, 습격 무리 몰이', '공존 보상 2배, 생산 단계 문화 +1', '즉시 문화 +5'],
  synth: ['', '포자 안개 기준치 +3', '유닛 업그레이드 비용 −1, 습격 판정 +1', '방위 행동 +1, 연구 비용 −1', '즉시 문화 +5'],
};
