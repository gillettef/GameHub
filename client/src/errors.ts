// 서버가 돌려주는 영어 오류 문구(GameError·RoomError)를 사용자에게 보일 한국어로 바꾼다.
// 서버 문구는 코드용이라 그대로 화면에 내면 무슨 뜻인지 알기 어렵다. 새 GameError 를 추가하면 여기에도 넣을 것 —
// 없는 문구는 일반 안내로 대체하고 원문은 콘솔에만 남긴다.

const EXACT: Record<string, string> = {
  'not your turn': '지금은 내 차례가 아닙니다',
  'room not found': '방을 찾을 수 없습니다 (코드를 확인하세요)',
  'room is full': '방이 가득 찼습니다',
  'game already started': '이미 게임이 시작된 방입니다',
  'game not started': '아직 게임이 시작되지 않았습니다',
  'name already taken': '이미 쓰고 있는 닉네임입니다',
  'name required': '닉네임을 입력하세요',
  'code required': '방 코드를 입력하세요',
  'host only': '호스트만 할 수 있습니다',
  'cannot kick the host': '호스트는 내보낼 수 없습니다',
  'invalid rejoin': '재접속 정보가 올바르지 않습니다',
  'invalid rejoin credentials': '재접속 정보가 올바르지 않습니다',
  'emblem already taken': '다른 참가자가 쓰고 있는 엠블럼입니다',
  'too many messages': '채팅을 너무 빨리 보내고 있습니다',
  'players must be 1~4': '참가자는 1~4명이어야 합니다',
  'no such bot': '그런 AI 참가자가 없습니다',
  'not in this room': '이 방의 참가자가 아닙니다',

  'not in draft phase': '지금은 임원 드래프트 단계가 아닙니다',
  'not in objective phase': '지금은 목표 카드를 고르는 단계가 아닙니다',
  'not in board meeting': '지금은 이사회 단계가 아닙니다',
  'not a weekday': '지금은 화·수·목 행동 단계가 아닙니다',
  'not in match preparation': '지금은 경기 준비 단계가 아닙니다',
  'not in match phase': '지금은 경기 진행 단계가 아닙니다',
  'not in match aftermath': '지금은 경기 결과 단계가 아닙니다',
  'already picked this round': '이번 라운드에는 이미 골랐습니다',
  'already chosen': '이미 골랐습니다',
  'already decided': '이미 결정했습니다',
  'already submitted': '이미 제출했습니다',
  'card not offered': '선택할 수 없는 카드입니다',

  'basic action already taken today': '오늘의 기본 행동은 이미 했습니다',
  'paid action already taken today': '오늘의 유급 카드 행동은 이미 했습니다',
  'no basic action today (board effect)': '이사회 효과로 오늘은 기본 행동을 할 수 없습니다',
  'only card actions today (board effect)': '이사회 효과로 오늘은 카드 행동만 할 수 있습니다',
  'cannot undo after a card was revealed': '카드가 공개되어 이 차례는 되돌릴 수 없습니다',
  'nothing to undo': '되돌릴 행동이 없습니다',
  'undo only during weekdays': '되돌리기는 화·수·목 차례에서만 됩니다',
  'choose staff for unpaid upkeep first': '유지비 미납으로 출장정지를 받을 직원을 먼저 고르세요',

  'not enough fandom': '팬덤이 부족합니다',
  'not enough fandom to reroll': '다시 굴릴 팬덤이 부족합니다',
  'billboard slots full': '광고판 자리가 가득 찼습니다',
  'naming sponsor already signed': '유니폼 스폰서는 이미 계약했습니다',
  'stadium full': '더 지을 시설 자리가 없습니다',
  'office track complete': '사무실을 더 확장할 수 없습니다',
  'card already used this week': '이 카드는 이번 주에 이미 썼습니다',
  'card has no action': '카드 행동이 없는 카드입니다',
  'card has no effect': '효과가 없는 카드입니다',
  'card is suspended': '출장정지 중인 카드입니다',
  'already trained': '이미 훈련한 선수입니다',
  'prospect deck empty': '유망주 더미가 비었습니다',
  'tactic deck empty': '전술 카드 더미가 비었습니다',
  'board deck exhausted': '이사회 카드 더미가 비었습니다',
  'opponent deck exhausted': '상대 팀 카드가 더 없습니다',
  'no opponent left': '상대 팀 카드가 더 없습니다',
  'already redrawn this match day': '전술 카드는 경기일마다 한 번만 새로 뽑을 수 있습니다',
  'formation card cannot be used for its effect': '포메이션에 쓴 전술 카드는 효과로 쓸 수 없습니다',
  'tactic card not in hand': '손에 없는 전술 카드입니다',
  'card not in hand': '손에 없는 카드입니다',

  'injured or suspended player cannot play': '부상·출장정지 선수는 출전할 수 없습니다',
  'only one goalkeeper can play': '골키퍼는 한 명만 출전할 수 있습니다',
  'duplicate player': '같은 선수를 두 번 넣을 수 없습니다',
  'too many fandom in stands': '관중석에 놓을 수 있는 팬덤보다 많습니다',
  'placements must cover exactly the field tokens': '출전 유니폼을 모두 배치해야 합니다',
  'invalid formation index': '올바르지 않은 포메이션입니다',
  'invalid activation amount': '효과 활성화 자원 수가 올바르지 않습니다',
  'activation for a player who is not playing': '출전하지 않는 선수의 효과는 활성화할 수 없습니다',
  'no field token to swap with': '자리를 바꿀 유니폼이 없습니다',

  'roll first': '먼저 주사위를 굴리세요',
  'already rolled; use reroll': '이미 굴렸습니다. 다시 굴리려면 재굴림을 쓰세요',
  'match roll already applied': '경기 영향은 이미 적용했습니다',
  'no injury die to roll': '굴릴 부상 주사위가 없습니다',
  'invalid target': '고를 수 없는 대상입니다',

  'too many rooms': '방을 너무 많이 만들었습니다. 잠시 뒤 다시 시도하세요',
  'too many requests': '요청을 너무 빨리 보내고 있습니다',
  'message too large': '메시지가 너무 깁니다',
  'invalid JSON': '올바르지 않은 요청입니다',
  'internal error': '서버에서 오류가 났습니다. 잠시 뒤 다시 시도하세요',
  'invalid action': '올바르지 않은 행동입니다',
  'invalid division': '올바르지 않은 부입니다',
  'invalid emblem': '올바르지 않은 엠블럼입니다',
};

const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^not enough (\w+)$/, (m) => `${{ money: '돈', fandom: '팬덤', ops: '운영', stamina: '체력' }[m[1]!] ?? m[1]}이(가) 부족합니다`],
  [/^market index \d+ not purchasable$/, () => '지금은 살 수 없는 시장 위치입니다 (오른쪽 3장만 구매 가능)'],
  [/^market index \d+ out of range$/, () => '시장에 없는 카드입니다'],
  [/^duplicate uniform number/, () => '같은 등번호 선수는 함께 출전할 수 없습니다'],
  [/^formation mismatch/, () => '배치가 포메이션과 맞지 않습니다 (라인별 인원·센터 1~3·윙 1명 이하)'],
  [/^invalid region/, () => '올바르지 않은 배치 지역입니다'],
  [/cannot play in /, () => '그 선수는 그 구획에 배치할 수 없습니다'],
  [/already built$/, () => '이미 지은 시설입니다'],
  [/ requires /, () => '먼저 지어야 하는 시설이 있습니다 (관중석은 번호 순서로)'],
  [/^no such /, () => '존재하지 않는 대상입니다'],
  [/^unknown (roster )?player/, () => '존재하지 않는 선수입니다'],
  [/^unknown pending effect/, () => '이미 처리된 선택입니다'],
  [/takes no target/, () => '대상을 고를 수 없는 효과입니다'],
];

export function koError(message: string): string {
  const exact = EXACT[message];
  if (exact) return exact;
  for (const [re, f] of PATTERNS) {
    const m = message.match(re);
    if (m) return f(m);
  }
  if (/[가-힣]/.test(message)) return message; // 이미 한국어(클라이언트 자체 문구)
  console.warn('[eleven] 번역되지 않은 서버 오류:', message);
  return '지금은 그 행동을 할 수 없습니다';
}
