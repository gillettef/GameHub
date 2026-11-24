// 정원 설계도 A (룰북 v2.3 그림 1). 좌표: x 1..7 = a..g (서→동), y 1..7 (북→남)
export const SIZE = 7;
export const DIRS = ['N', 'E', 'S', 'W'];
export const DV = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
export const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
export const SEATS_CW = ['N', 'E', 'S', 'W'];

export const SEAT_INFO = {
  N: { label: '북', crest: '장미', color: '#c0392b' },
  E: { label: '동', crest: '수국', color: '#2e6fbf' },
  S: { label: '남', crest: '해바라기', color: '#c99a06' },
  W: { label: '서', crest: '담쟁이', color: '#2e8b57' },
  X: { label: '중립', crest: '달', color: '#9aa0a6' },
};

const rot = (x, y, d) => [8 - y, x, DIRS[(DIRS.indexOf(d) + 1) % 4]];
function orbit(c) {
  const o = [c];
  for (let i = 0; i < 3; i++) o.push(rot(...o[o.length - 1]));
  return o;
}

/** 생울타리: 칸 (x,y)의 d 쪽 변. 양쪽 칸에 모두 기록한다. */
export const HEDGES = new Set();
for (const seed of [[3, 3, 'N'], [2, 2, 'S'], [4, 1, 'S']]) {
  for (const [x, y, d] of orbit(seed)) {
    HEDGES.add(`${x},${y},${d}`);
    const [dx, dy] = DV[d];
    HEDGES.add(`${x + dx},${y + dy},${OPP[d]}`);
  }
}

export const PAVILION = [4, 4];
export const RENDEZVOUS = [[3, 3], [5, 3], [5, 5], [3, 5]];
/** 시작 칸 번호 1..16 → [x, y, 방향]. 13~16은 4인 전용. */
export const START = [
  [2, 2, 'S'], [3, 2, 'S'], [5, 2, 'E'], [6, 2, 'W'], [2, 3, 'N'], [6, 3, 'W'],
  [2, 5, 'E'], [6, 5, 'S'], [2, 6, 'E'], [3, 6, 'W'], [5, 6, 'N'], [6, 6, 'N'],
  [4, 1, 'S'], [1, 4, 'E'], [7, 4, 'W'], [4, 7, 'N'],
];

export const hasHedge = (x, y, d) => HEDGES.has(`${x},${y},${d}`);
export const inBoard = (x, y) => x >= 1 && x <= SIZE && y >= 1 && y <= SIZE;
export const isPavilion = (x, y) => x === PAVILION[0] && y === PAVILION[1];
export const isRendezvous = (x, y) => RENDEZVOUS.some(([a, b]) => a === x && b === y);
export const cellName = (x, y) => `${'abcdefg'[x - 1]}${y}`;
