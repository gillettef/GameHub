export {
  COLOR_LABEL,
  CONTRACT_LABEL,
  DAY_LABEL,
  INFRA_EFFECT,
  INFRA_LABEL,
  matchDieLabel,
  RESOURCE_LABEL,
  SECTOR_LABEL,
  SET_LABEL,
  TOKEN_LABEL,
  describeCondition,
  describeCost,
  describeEffect,
  describeEffects,
  phaseLabel,
} from '../engine/labels';

export const SECTOR_SHORT = { LW: 'LW', CB: 'CB', CM: 'CM', CF: 'CF', RW: 'RW' } as const;
export const KIND_LABEL = { starter: '주전', prospect: '유망주', veteran: '베테랑' } as const;
export const TIMING_LABEL = { beforeMatch: '경기 전', duringMatch: '경기 중', afterMatch: '경기 후' } as const;

// 참가자 자리별 유니폼 색 (역할 색과 겹치지 않게)
export const SEAT_COLORS = ['#0F766E', '#7C3AED', '#DB2777', '#B45309'];
