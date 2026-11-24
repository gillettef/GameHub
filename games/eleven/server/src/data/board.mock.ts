// 보드 인쇄 수치. 사무실 트랙·기반 시설 종류/보너스·트랙 초과/부족 자원·유지비 색 구간은 규칙서 그림(p.6~7, p.19)에서 읽음,
// 조달 트랙 값과 기반 시설 승점은 placeholder (CLAUDE.md Mock 데이터 정책)
import type { BoardData } from '../engine/types';

// 유지비 트랙(p.7 구단 보드 왼쪽): 보유 수 칸의 색 → 초록 1돈, 노랑 2돈, 빨강 3돈
const upkeepBands = (green: number, yellow: number, max = 12): number[] => Array.from({ length: max + 1 }, (_, n) => (n === 0 ? 0 : n <= green ? 1 : n <= yellow ? 2 : 3));

export const BOARD_DATA: BoardData = {
  // p.19: 3돈→2승점, 5돈→5승점, 5돈→9승점, 7돈→15승점. cost = 이 칸에서 위로 올라가는 비용
  office: [
    { cost: 3, vp: 0 },
    { cost: 5, vp: 2 },
    { cost: 5, vp: 5 },
    { cost: 7, vp: 9 },
    { cost: 0, vp: 15 },
  ],
  // 능력치 위치 1~5별 월요일 조달량 = 트랙 위치 숫자 그대로 (사용자 결정, 2026-09: 위치 N 이면 N개)
  procurement: {
    money: [1, 2, 3, 4, 5],
    fandom: [1, 2, 3, 4, 5],
    ops: [1, 2, 3, 4, 5],
    stamina: [1, 2, 3, 4, 5],
  },
  // p.7: 선수 1~2 초록 / 3~5 노랑 / 6+ 빨강, 스타디움 1~4 / 5~6 / 7+, 직원 1~4 / 5~7 / 8+
  upkeep: {
    players: upkeepBands(2, 5),
    stadium: upkeepBands(4, 6),
    staff: upkeepBands(4, 7),
  },
  // p.7 구단 보드 각 트랙 양끝 아이콘
  trackOverflow: {
    money: { below: 'stamina', above: 'ops' },
    fandom: { below: 'money', above: 'money' },
    ops: { below: 'fandom', above: 'stamina' },
    stamina: { below: 'ops', above: 'fandom' },
  },
  // p.19 기반 시설 토큰 (원본 보드 수치, 사용자 확인 2026-09): 건설 즉시 능력치 트랙 +1, 게임 종료 시 승점
  infrastructure: [
    { type: 'lights', name: '스타디움 조명', vp: 2, bonus: [{ type: 'moveTrack', track: 'fandom', delta: 1 }], unique: false },
    { type: 'shop', name: '상점', vp: 0, bonus: [{ type: 'moveTrack', track: 'money', delta: 1 }], unique: false },
    { type: 'execOffice', name: '임원실', vp: 2, bonus: [{ type: 'moveTrack', track: 'ops', delta: 1 }], unique: false },
    { type: 'trainingGround', name: '훈련장', vp: 2, bonus: [{ type: 'moveTrack', track: 'stamina', delta: 1 }], unique: false },
    { type: 'stand3', name: '3번 관중석', vp: 1, bonus: [], unique: true },
    { type: 'stand4', name: '4번 관중석', vp: 1, bonus: [], unique: true, requires: 'stand3' }, // 3번 관중석 다음에만 (번호 순서)
    { type: 'billboard3', name: '3번 광고판', vp: 1, bonus: [], unique: true },
  ],
};
