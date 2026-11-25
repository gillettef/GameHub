// 룰북 v0.3.1의 고정 데이터: 아레나 배치(3장), 시작 칸(D-028), 규칙 타일 20종 45개(11장).
import type { Dir, Pos, TileDef } from './types';

export const SIZE = 7;
export const ROUNDS = 8;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 5;
export const MAX_ENERGY = 3;
export const START_ENERGY = 1;
export const CORE_TOKENS = 20;

const at = (s: string): Pos => ({ x: s.charCodeAt(0) - 65, y: Number(s.slice(1)) - 1 });

export const PILLARS: Pos[] = ['B2', 'F2', 'B6', 'F6'].map(at);
/** 코어 생성 지점. 보충 우선순위 순서(D4·D2·F4·D6·B4) */
export const CORE_SPOTS: Pos[] = ['D4', 'D2', 'F4', 'D6', 'B4'].map(at);

const start = (s: string, dir: Dir) => ({ ...at(s), dir });
/** 인원별 시작 칸 (선 플레이어부터 시계 방향) */
export const STARTS: Record<number, (Pos & { dir: Dir })[]> = {
  3: [start('C2', 1), start('F3', 2), start('B5', 0)],
  4: [start('C2', 1), start('F3', 2), start('E6', 3), start('B5', 0)],
  5: [start('C2', 1), start('F3', 2), start('E6', 3), start('D5', 0), start('B5', 0)],
};

export const TILES: TileDef[] = [
  { code: 'T01', cond: 'frontEmpty', acts: [{ k: 'fwd', n: 2 }], text: '앞 칸이 비어 있으면 → 2칸 전진', count: 3 },
  { code: 'T02', cond: 'frontBlocked', acts: [{ k: 'right' }], text: '앞 칸이 막힌 칸이면 → 우회전', count: 3 },
  { code: 'T03', cond: 'frontBlocked', acts: [{ k: 'about' }], text: '앞 칸이 막힌 칸이면 → 뒤로 돌기', count: 2 },
  { code: 'T04', cond: 'lineCore', acts: [{ k: 'fwd', n: 3 }], text: '앞줄에 코어가 있으면 → 3칸 전진', count: 3 },
  { code: 'T05', cond: 'lineCore', acts: [{ k: 'fwd', n: 1 }], text: '앞줄에 코어가 있으면 → 1칸 전진', count: 2 },
  { code: 'T06', cond: 'lineNoCore', acts: [{ k: 'right' }], text: '앞줄에 코어가 없으면 → 우회전', count: 3 },
  { code: 'T07', cond: 'lineBot', acts: [{ k: 'advStop' }], text: '앞줄에 로봇이 있으면 → 멈출 때까지 전진', count: 2 },
  { code: 'T08', cond: 'lineBot', acts: [{ k: 'about' }], text: '앞줄에 로봇이 있으면 → 뒤로 돌기', count: 2 },
  { code: 'T09', cond: 'botAdj', acts: [{ k: 'back', n: 1 }], text: '로봇이 인접해 있으면 → 1칸 후퇴', count: 3 },
  { code: 'T10', cond: 'botAdj', acts: [{ k: 'wait' }], text: '로봇이 인접해 있으면 → 대기', count: 2 },
  { code: 'T11', cond: 'coreAdj', acts: [{ k: 'left' }], text: '코어가 인접해 있으면 → 좌회전', count: 2 },
  { code: 'T12', cond: 'coreAdj', acts: [{ k: 'wait' }], text: '코어가 인접해 있으면 → 대기', count: 2 },
  { code: 'T13', cond: 'onEdge', acts: [{ k: 'about' }], text: '가장자리 칸에 있으면 → 뒤로 돌기', count: 2 },
  { code: 'T14', cond: 'onEdge', acts: [{ k: 'advStop' }], text: '가장자리 칸에 있으면 → 멈출 때까지 전진', count: 2 },
  { code: 'T15', cond: 'noBotWithin2', acts: [{ k: 'right' }], text: '거리 2 이내에 로봇이 없으면 → 우회전', count: 2 },
  { code: 'T16', cond: 'pilotCores2', acts: [{ k: 'wait' }], text: '조종사의 코어가 2개 이상이면 → 대기', count: 2 },
  { code: 'T17', cond: 'frontEmpty', acts: [{ k: 'fwd', n: 1 }, { k: 'left' }], text: '앞 칸이 비어 있으면 → 1칸 전진 후 좌회전', count: 2 },
  { code: 'T18', cond: 'always', acts: [{ k: 'fwd', n: 1 }], text: '항상 → 1칸 전진', count: 2 },
  { code: 'T19', cond: 'always', acts: [{ k: 'left' }], text: '항상 → 좌회전', count: 2 },
  { code: 'T20', cond: 'always', acts: [{ k: 'back', n: 2 }], text: '항상 → 2칸 후퇴', count: 2 },
];

export const DIR_NAMES = ['위', '오른쪽', '아래', '왼쪽'] as const;
export const cellName = (p: Pos) => `${String.fromCharCode(65 + p.x)}${p.y + 1}`;
