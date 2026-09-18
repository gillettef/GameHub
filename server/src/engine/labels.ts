import type { DieColor, Effect, InfrastructureType, PlayerToken, Resource, Sector, SponsorContract, StaffSet } from './types';

// 한국어 라벨. 엔진 기록과 클라이언트가 공유한다

export const RESOURCE_LABEL: Record<Resource, string> = { money: '돈', fandom: '팬덤', ops: '운영', stamina: '체력' };
export const SECTOR_LABEL: Record<Sector, string> = { LW: '레프트 윙', CB: '센터 백', CM: '센터 미드', CF: '센터 포워드', RW: '라이트 윙' };
export const TOKEN_LABEL: Record<PlayerToken, string> = {
  injury: '부상',
  suspension: '출장정지',
  strengthTemp: '일시 역량',
  strengthPerm: '영구 역량',
  weaknessTemp: '일시 약점',
  weaknessPerm: '영구 약점',
};
export const COLOR_LABEL: Record<DieColor, string> = { yellow: '노랑', blue: '파랑', red: '빨강' };
export const SET_LABEL: Record<StaffSet, string> = { medical: '의료', coaching: '코칭', scouting: '스카우트', operations: '운영', commercial: '상업' };
// p.18 본문 표기(장내 방송·광고판·유니폼). 참조표(p.31)의 스폰서키트·스타디움 명명권과 같은 것
export const CONTRACT_LABEL: Record<SponsorContract, string> = { kit: '장내 방송', billboard: '광고판', naming: '유니폼' };
export const INFRA_LABEL: Record<InfrastructureType, string> = {
  lights: '스타디움 조명',
  shop: '상점',
  execOffice: '임원실',
  trainingGround: '훈련장',
  stand3: '3번 관중석',
  stand4: '4번 관중석',
  billboard3: '3번 광고판',
};
export const DAY_LABEL = { setup: '준비', mon: '월요일', tue: '화요일', wed: '수요일', thu: '목요일', fri: '금요일', weekend: '주말' } as const;
export { matchDieLabel } from './matchDie';

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function describeEffect(e: Effect): string {
  switch (e.type) {
    case 'gainResource':
      return `${RESOURCE_LABEL[e.resource]} ${sign(e.amount)}`;
    case 'moveTrack':
      return `${RESOURCE_LABEL[e.track]} 트랙 ${sign(e.delta)}`;
    case 'gainVP':
      return `승점 ${sign(e.amount)}`;
    case 'trainPlayer':
      return `선수 ${e.count}명 훈련`;
    case 'drawTactic':
      return `전술 카드 ${e.count}장`;
    case 'recruitProspectFree':
      return '유망주 무료 영입';
    case 'placeStamina':
      return `선수 카드에 체력 ${e.count}개`;
    case 'addPlayerToken':
      return `${TOKEN_LABEL[e.token]} +${e.count}${e.spread && e.count > 1 ? ' (1개씩 나눠서)' : ''}`;
    case 'removePlayerToken':
      return `${TOKEN_LABEL[e.token]} −${e.count}${e.spread && e.count > 1 ? ' (1개씩 나눠서, 최대)' : ''}`;
    case 'scoreGoal':
      return `${e.team === 'self' ? '우리 팀' : '상대 팀'} ${sign(e.amount)}골`;
    case 'peekOpponent':
      return '다음 상대 팀 카드 앞면 확인';
    case 'text':
      return e.text;
  }
}

export function describeEffects(effects: readonly Effect[]): string {
  return effects.map(describeEffect).join(', ');
}

export function describeCost(cost: Partial<Record<Resource, number>>): string {
  const parts = (Object.entries(cost) as [Resource, number][]).filter(([, n]) => n > 0).map(([r, n]) => `${RESOURCE_LABEL[r]} ${n}`);
  return parts.length ? parts.join(', ') : '무료';
}

export function phaseLabel(kind: string): string {
  switch (kind) {
    case 'setup.draft':
      return '임원 드래프트';
    case 'setup.objective':
      return '목표 카드 선택';
    case 'monday.board':
      return '월요일 · 이사회';
    case 'weekday':
      return '주중 행동';
    case 'friday.prepare':
      return '금요일 · 경기 준비';
    case 'friday.aftermath':
      return '금요일 · 경기 결과';
    case 'gameOver':
      return '게임 종료';
    default:
      return kind;
  }
}
