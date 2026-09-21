import type { DieColor, Effect, InfrastructureType, MatchCondition, PlayerToken, Resource, Sector, SponsorContract, StaffSet } from './types';

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
// 기반 시설이 하는 일 한 줄 (p.19). 트랙 +1 은 건설 즉시 1회(보드 데이터의 bonus), 관중석·광고판은 칸이 늘어난다
export const INFRA_EFFECT: Record<InfrastructureType, string> = {
  lights: '건설 즉시 팬덤 트랙 +1칸 (매주 조달 팬덤 ↑)',
  shop: '건설 즉시 돈 트랙 +1칸 (매주 조달 돈 ↑)',
  execOffice: '건설 즉시 운영 트랙 +1칸 (매주 조달 운영 ↑)',
  trainingGround: '건설 즉시 체력 트랙 +1칸 (매주 조달 체력 ↑)',
  stand3: '관중석 +1석 (경기마다 팬덤 1개 더 놓아 돈으로)',
  stand4: '관중석 +1석 (3번 관중석을 지은 뒤에만)',
  billboard3: '광고판 스폰서를 3장까지 계약',
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
    case 'trainPlayer': {
      const base = e.target === 'self' ? '이 선수를 훈련' : `선수 ${e.count}명 훈련`;
      const extra = (Object.entries(e.withTokens ?? {}) as [PlayerToken, number][]).filter(([, n]) => n > 0).map(([t, n]) => `${TOKEN_LABEL[t]} +${n}`);
      return extra.length ? `${base} (그 선수에 ${extra.join(', ')})` : base;
    }
    case 'drawTactic':
      return `전술 카드 ${e.count}장`;
    case 'recruitProspectFree':
      return '유망주 무료 영입';
    case 'placeStamina':
      return `선수 카드에 체력 ${e.count}개`;
    case 'addPlayerToken':
      return `${e.target === 'self' ? '이 선수에 ' : ''}${TOKEN_LABEL[e.token]} +${e.count}${e.spread && e.count > 1 ? ' (1개씩 나눠서)' : ''}`;
    case 'removePlayerToken':
      return `${e.target === 'self' ? '이 선수의 ' : ''}${TOKEN_LABEL[e.token]} −${e.count}${e.spread && e.count > 1 ? ' (1개씩 나눠서, 최대)' : ''}`;
    case 'rollDie':
      return `주사위 ${e.atMost} 이하면 ${describeEffects(e.effects)}${e.otherwise?.length ? `, 아니면 ${describeEffects(e.otherwise)}` : ''}`;
    case 'scoreGoal':
      return `${e.team === 'self' ? '우리 팀' : '상대 팀'} ${sign(e.amount)}골`;
    case 'peekOpponent':
      return '다음 상대 팀 카드 앞면 확인';
    case 'conditional':
      return `${describeCondition(e.condition)}: ${describeEffects(e.effects)}`;
    case 'denyGoals':
      return `상대 득점 ${e.count}개 무효`;
    case 'extraSaves':
      return `이번 경기 선방 +${e.count}`;
    case 'sectorSkill':
      return `이번 경기 ${SECTOR_LABEL[e.sector]} 구획 전원 역량 ${sign(e.delta)}`;
    case 'flipUnmatchedToken':
      return `카드 없는 유니폼 토큰 ${e.count}개 뒤집기`;
    case 'discardMarketCard':
      return `이적 시장 ${{ players: '주전 선수', veterans: '베테랑', staff: '직원', sponsors: '스폰서' }[e.row]} 카드 1장 버리고 보충`;
    case 'addStaffSuspension':
      return `직원 카드 1장에 출장정지 +${e.count}`;
    case 'releasePlayer':
      return '선수 1명 방출 (방출 행동과 같은 보상)';
    case 'restrictDay':
      return `${e.week === 'next' ? '다음 주' : '이번 주'} ${DAY_LABEL[e.day]} ${e.mode === 'noBasic' ? '기본 행동 불가' : '카드 행동만 가능'}`;
    case 'breakNamingSponsor':
      return `유니폼 스폰서가 있으면 계약 파기 후 그 카드의 장내 방송 효과, 없으면 ${describeEffects(e.otherwise)}`;
    case 'passive':
      return e.passive === 'extraStand' ? '상시: 매 경기 관중석 +1' : '상시: 승리할 때마다 팬덤 +1';
    case 'upkeepDiscount':
      return `다음 주말 유지비 −${e.amount}`;
    case 'text':
      return e.text;
  }
}

export function describeCondition(c: MatchCondition): string {
  switch (c.kind) {
    case 'outcome':
      return { win: '승리했다면', draw: '무승부라면', loss: '패배했다면' }[c.outcome];
    case 'goalsAtLeast':
      return `${c.goals}골 이상 득점했다면`;
    case 'cleanSheet':
      return '실점하지 않았다면';
    case 'inSector':
      return `이 선수가 ${SECTOR_LABEL[c.sector]} 구획에 출전했다면`;
    case 'scoredInSector':
      return `${SECTOR_LABEL[c.sector]} 구획에서 득점했다면`;
    case 'opponentHigherInLeague':
      return '상대 팀이 리그에서 더 앞서 있다면';
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
    case 'friday.match':
      return '금요일 · 경기 진행';
    case 'friday.aftermath':
      return '금요일 · 경기 결과';
    case 'gameOver':
      return '게임 종료';
    default:
      return kind;
  }
}
