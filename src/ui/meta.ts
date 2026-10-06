import { CFG } from '../game/engine';
import type { FacilityType, Phase, StaffKey } from '../game/types';
import type { IconName } from './Icon';

export const TYPE_META: Record<FacilityType, { icon: IconName; color: string; short: string }> = {
  스릴형: { icon: 'thrill', color: '#ff6b6b', short: '스릴' },
  패밀리형: { icon: 'familyRide', color: '#ffb347', short: '패밀리' },
  공포형: { icon: 'horror', color: '#a58bff', short: '공포' },
  어드벤처형: { icon: 'adventure', color: '#4cc38a', short: '어드벤처' },
  교육형: { icon: 'education', color: '#4aa8ff', short: '교육' },
  물놀이형: { icon: 'water', color: '#38d4d4', short: '물놀이' },
  놀이형: { icon: 'playground', color: '#ff7ac8', short: '놀이' },
  상점: { icon: 'shop', color: '#f5d04b', short: '상점' },
  부대시설: { icon: 'amenity', color: '#9aa8c7', short: '부대' },
};

/** 인력 효과 설명 (레벨 1당 효과, 수치는 CFG에서) */
export const STAFF_META: Record<StaffKey, { icon: IconName; label: string; desc: string; color: string }> = {
  marketer: { icon: 'marketer', label: '마케팅 전문가', desc: 'Lv당 매 라운드 데려올 수 있는 관객 +1명', color: '#ff7ac8' },
  guide: { icon: 'guide', label: '안내 직원', desc: 'Lv당 시설 1곳 수용 인원 +1 (원래 수익·만족도가 높은 시설부터)', color: '#6cc7ff' },
  engineer: { icon: 'engineer', label: '엔지니어', desc: `Lv당 고장 확률 -${Math.round(CFG.breakPerEngineer * 100)}%p(최소 ${Math.round(CFG.breakMin * 100)}%) · 매 라운드 무료 수리 1건`, color: '#ffb347' },
  cleaner: { icon: 'cleaner', label: '환경 미화원', desc: 'Lv당 매 라운드 쓰레기 2개 무료 청소', color: '#5ee0a0' },
  researcher: { icon: 'researcher', label: '연구원', desc: `Lv당 건설비 -$1(최소 $${CFG.minPrice}) · 매 라운드 만족도 +${CFG.researchSat}`, color: '#a58bff' },
};

export const PHASES: { key: Exclude<Phase, 'gameOver'>; label: string; icon: IconName }[] = [
  { key: 'construct', label: '건설', icon: 'build' },
  { key: 'promote', label: '홍보', icon: 'promote' },
  { key: 'operate', label: '운영', icon: 'operate' },
  { key: 'manage', label: '관리', icon: 'manage' },
];
