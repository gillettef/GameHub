// 경기 영향 주사위 표 (경기 보드 인쇄, p.8 그림 / p.24). 열 = 경기 결과, 행 = 주사위 눈. 6이 가장 좋고 1이 가장 나쁘다
export type MatchOutcome = 'win' | 'draw' | 'loss';

export type MatchDieResult =
  | 'fandomUp' // 팬덤 능력치 마커 +1
  | 'train' // 출전 선수 1명 훈련
  | 'strength' // 일시적 역량 1
  | 'weakness' // 일시적 약점 1
  | 'injury' // 부상 1
  | 'severeInjury' // 심각한 부상 (부상 2)
  | 'doubleInjury' // 두 번의 부상
  | 'doubleSevereInjury'; // 두 번의 심각한 부상

// [눈 1..6] 순서
const TABLE: Record<MatchOutcome, [MatchDieResult, MatchDieResult, MatchDieResult, MatchDieResult, MatchDieResult, MatchDieResult]> = {
  win: ['severeInjury', 'injury', 'weakness', 'strength', 'train', 'fandomUp'],
  draw: ['doubleInjury', 'injury', 'weakness', 'strength', 'strength', 'train'],
  loss: ['doubleSevereInjury', 'severeInjury', 'injury', 'weakness', 'strength', 'strength'],
};

export function matchDieResult(outcome: MatchOutcome, face: number): MatchDieResult {
  const row = TABLE[outcome][face - 1];
  if (!row) throw new RangeError(`invalid die face: ${face}`);
  return row;
}

export const MATCH_DIE_RESULT_LABEL: Record<MatchDieResult, string> = {
  fandomUp: '팬덤 트랙 +1',
  train: '출전 선수 1명 훈련',
  strength: '출전 선수 1명 일시 역량 +1',
  weakness: '출전 선수 1명 일시 약점 +1',
  injury: '부상 (12면체 → 등번호)',
  severeInjury: '심각한 부상 (부상 토큰 2개)',
  doubleInjury: '두 번의 부상',
  doubleSevereInjury: '두 번의 심각한 부상',
};

export function matchDieLabel(outcome: MatchOutcome, face: number): string {
  return MATCH_DIE_RESULT_LABEL[matchDieResult(outcome, face)];
}
