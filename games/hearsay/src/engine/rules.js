// HEARSAY 룰북 v0.5의 수치. 룰의 기준은 rules/rulebook.md이며, 여기 값은 그것을 옮긴 것이다.

export const HOUSES = [
  { id: 'red', name: '빨강', hex: '#c8473b' },
  { id: 'blue', name: '파랑', hex: '#3b67b5' },
  { id: 'yellow', name: '노랑', hex: '#e2b230' },
  { id: 'green', name: '초록', hex: '#3f8f57' },
  { id: 'purple', name: '보라', hex: '#7d55a8' },
  { id: 'black', name: '검정', hex: '#2b2b2b' },
];
export const GREY = 'grey';
export const EMPTY = 'empty';

export const PLOTS = [
  { id: 'river', name: '강가', value: 4, min: 4 },
  { id: 'harbor', name: '포구', value: 3, min: 4 },
  { id: 'well', name: '우물터', value: 3, min: 5 },
  { id: 'salt', name: '소금밭', value: 2, min: 4 },
  { id: 'hill', name: '북쪽 언덕', value: 2, min: 4 },
  { id: 'bamboo', name: '대숲', value: 2, min: 4 },
  { id: 'mud', name: '갯벌', value: 2, min: 6 },
];

export const SEASONS = 7;
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 6;

/** 인원수에 맞는 구역(인원+1개) */
export function plotsFor(n) {
  return PLOTS.filter((p) => p.min <= n);
}

/** 회의의 질문 수. season은 2~7 또는 'final' */
export function questionsFor(n, season) {
  if (season === 'final') return { 4: 4, 5: 3, 6: 2 }[n];
  if (n === 6 && (season === 2 || season === 3)) return 1;
  return 2;
}

export const DEFAULT_TIMING = {
  whisperMs: 60_000, // 속삭임 시간 (모래시계 60초)
  claimRevealMs: 4_000, // 점유 공개 결과를 보여 주는 시간 (그 뒤 직전 열이 망각된다)
  resultMs: 6_000, // 증언 공개 결과를 보여 주는 시간
  chooseMs: 60_000, // 디지털 편의: 질문자가 이 시간 안에 고르지 않으면 자동 지정
  claimMs: 90_000, // 디지털 편의: 이 시간 안에 구역 카드를 고르지 않으면 무작위로 놓는다
  chatTtlMs: 20_000, // 말은 흩어진다: 채팅은 이 시간 뒤 사라진다
};
