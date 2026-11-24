// LIGHTCONE 지도 데이터 (rules/rulebook.md 2.1절, 단순판 v0.7)

export const ADJ = {
  A: ['1', '2', '3'],
  1: ['A', '2', '4', '5'], 2: ['A', '1', '3', '5', '6'], 3: ['A', '2', '6', '7'],
  4: ['1', '5', '8'], 5: ['1', '2', '4', '6', '8', '9'],
  6: ['2', '3', '5', '7', '9', '10'], 7: ['3', '6', '10'],
  8: ['4', '5', '9', '11', '12'], 9: ['5', '6', '8', '10', '12', '13'],
  10: ['6', '7', '9', '13', '14'],
  11: ['8', '12', '15'], 12: ['8', '9', '11', '13', '15', '16'],
  13: ['9', '10', '12', '14', '16', '17'], 14: ['10', '13', '17'],
  15: ['11', '12', '16', 'B'], 16: ['12', '13', '15', '17', 'B'], 17: ['13', '14', '16', 'B'],
  B: ['15', '16', '17'],
};

export const SYSTEMS = ['A', ...Array.from({ length: 17 }, (_, i) => String(i + 1)), 'B'];
export const PLANETS = ['2', '4', '7', '8', '9', '10', '11', '14', '16'];
export const HOME = { A: 'A', B: 'B' };

// 열(x)·행(y) 좌표. 성계 9(3, 2) 기준 점대칭.
export const POS = {
  A: [0, 2], 1: [1, 1], 2: [1, 2], 3: [1, 3],
  4: [2, 0.5], 5: [2, 1.5], 6: [2, 2.5], 7: [2, 3.5],
  8: [3, 1], 9: [3, 2], 10: [3, 3],
  11: [4, 0.5], 12: [4, 1.5], 13: [4, 2.5], 14: [4, 3.5],
  15: [5, 1], 16: [5, 2], 17: [5, 3], B: [6, 2],
};

// 성운 카드 4장 (D-022)
export const NEBULA_CARDS = [['4', '14'], ['7', '11'], ['8', '10'], ['9']];

export const STRENGTH = { 1: 2, 2: 2, 3: 3 };
export const FLEET_IDS = [1, 2, 3];
export const ROUNDS = 10;
export const VICTORY = 6;
export const PLANET_COPIES = 2;
export const DECOYS = 3;
export const LAST_LIGHT_SLOTS = 3;

export function bfs(src) {
  const d = { [src]: 0 };
  const q = [src];
  while (q.length) {
    const u = q.shift();
    for (const v of ADJ[u]) {
      if (d[v] === undefined) { d[v] = d[u] + 1; q.push(v); }
    }
  }
  return d;
}

export const DIST = Object.fromEntries(SYSTEMS.map((s) => [s, bfs(s)]));

export function baseRipple(s) {
  return Math.max(DIST.A[s], DIST.B[s]);
}

export function rippleDistance(s, nebula = []) {
  return baseRipple(s) + (nebula.includes(s) ? 1 : 0);
}
