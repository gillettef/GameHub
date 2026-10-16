/** 이름 → 규칙 후보. 실험하면서 여기에 추가한다 */
import type { LabRules } from './engine.js';
import { BASE, GOALS_V2, SPECIES_V2, patchSpecies, variant } from './variants.js';

const goalsSoft = GOALS_V2.map((g) =>
  g.id === 'big-garden' ? { ...g, a: 4, b: 2 } : g.id === 'center-plaza' ? { ...g, a: 4 } : g.id === 'long-path' ? { ...g, a: 4, b: 2 } : g,
);

export const VARIANTS: Record<string, LabRules> = {
  base: BASE,
  sum: variant('v2-sum', { mode: 'sum', plantOn: 'touch' }),
  cap4: variant('cap4', { cap: 4 }),
  cap3: variant('cap3', { cap: 3 }),
  sup30: variant('sup30', { supply: { 2: 30, 3: 28, 4: 26 } }),
  sup24: variant('sup24', { supply: { 2: 24, 3: 22, 4: 20 } }),
  sup20: variant('sup20', { supply: { 2: 20, 3: 18, 4: 16 } }),
  softgoals: variant('softgoals', { goals: goalsSoft }),
  sup24cap4: variant('sup24cap4', { supply: { 2: 24, 3: 22, 4: 20 }, cap: 4 }),
  adjacent: variant('adjacent', { plantOn: 'adjacent' }),
};

// 식물 수치 1차 조정 (base 결과: 민들레·무궁화 강, 버섯·소나무·대나무·담쟁이·유채 약)
const at = (d: number, v: number, k = 1): [number, number, number] => {
  const D = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ] as const;
  return [D[d]![0] * k, D[d]![1] * k, v];
};
export const SPECIES_V3 = patchSpecies(SPECIES_V2, {
  dandelion: { ability: { kind: 'seed', value: 1, range: 2, count: 1 }, pattern: [[0, 0, 1], at(0, 1), at(3, 1)] },
  mugunghwa: { ability: { kind: 'bloom', value: 1 } },
  mushroom: { pattern: [[0, 0, 2]], ability: { kind: 'wither', value: 2 } },
  pine: { pattern: [[0, 0, 3], at(0, 1), at(3, 1)] },
  bamboo: { pattern: [[0, 0, 1], at(0, 1), at(1, 1), at(3, 1)], ability: { kind: 'cluster', value: 2 } },
  ivy: { pattern: [[0, 0, 2], at(0, 1)] },
  rapeseed: { pattern: [[0, 0, 2], at(0, 1), at(2, 1), at(4, 1)], ability: { kind: 'fertileRing', value: 1 } },
});
VARIANTS.sp3 = variant('sp3', { species: SPECIES_V3 });


export { SPECIES_V2, patchSpecies };

VARIANTS.adjsup24 = variant('adjsup24', { plantOn: 'adjacent', supply: { 2: 24, 3: 22, 4: 20 } });
VARIANTS.adjsup20 = variant('adjsup20', { plantOn: 'adjacent', supply: { 2: 20, 3: 18, 4: 16 } });
VARIANTS.adjsp3 = variant('adjsp3', { plantOn: 'adjacent', species: SPECIES_V3 });
VARIANTS.adjsup20sp3 = variant('adjsup20sp3', { plantOn: 'adjacent', supply: { 2: 20, 3: 18, 4: 16 }, species: SPECIES_V3 });
VARIANTS.adjsup24sp3 = variant('adjsup24sp3', { plantOn: 'adjacent', supply: { 2: 24, 3: 22, 4: 20 }, species: SPECIES_V3 });

// 차례 순서 구조 비교 (adjsup20sp3 기준)
const A = VARIANTS.adjsup20sp3!;
VARIANTS.tFixed = variant('tFixed', { firstPlayer: 'fixed' }, A);
VARIANTS.tRotate = variant('tRotate', { firstPlayer: 'rotate' }, A);
VARIANTS.tSupply = variant('tSupply', { firstPlayer: 'supply' }, A);
VARIANTS.tLowest = variant('tLowest', { firstPlayer: 'lowest' }, A);
VARIANTS.rRotate = variant('rRotate', { flow: 'round', refill: 'round', market: { 2: 2, 3: 3, 4: 4 }, firstPlayer: 'rotate' }, A);
VARIANTS.rSupply = variant('rSupply', { flow: 'round', refill: 'round', market: { 2: 2, 3: 3, 4: 4 }, firstPlayer: 'supply' }, A);

// v3a: 줄다리기 + 맞닿은 칸 심기 + 뿌리 공급 한정 + 공급처 많은 사람이 선 + 4인 덤
const HOOK_SUPPLY = '한정된 뿌리가 옮겨 다닌다(모자라면 내 땅에서 뽑아 오고, 밀려난 뿌리는 주인에게 돌아감)';
VARIANTS.v3a = variant(
  'v3a',
  { firstPlayer: 'supply', komi: { 2: [0, 0], 3: [0, 0, 0], 4: [0, 1, 1, 1] }, goals: goalsSoft, noCell: 'discard', hooks: [HOOK_SUPPLY], extraRules: ['라운드 선(공급처 큐브 많은 사람)'] },
  A,
);

// v4: 기본판 9종(능력 4개), 기름진 땅 일반 보너스 없음
const BASE9 = new Set(['grass', 'oak', 'pine', 'kudzu', 'fern', 'dandelion', 'lotus', 'mushroom', 'mugunghwa']);
export const SPECIES_V4 = SPECIES_V3.filter((s) => BASE9.has(s.id)).map((s) => (s.id === 'pine' ? { ...s, tags: ['tree' as const] } : s));
VARIANTS.v4 = variant(
  'v4',
  { species: SPECIES_V4, gardenSize: { 2: 6, 3: 6, 4: 8 }, copies: { 2: 4, 3: 5, 4: 5 }, fertileBonus: 0 },
  VARIANTS.v3a!,
);

// 2026-10-16 사용자 지시: 2·3인만 최적화. 2인 재미(역전·선두 교체) 개선 후보
const V4 = VARIANTS.v4!;
VARIANTS.p2s16 = variant('p2s16', { supply: { 2: 16, 3: 18, 4: 16 } }, V4);
VARIANTS.p2s18 = variant('p2s18', { supply: { 2: 18, 3: 18, 4: 16 } }, V4);
VARIANTS.p2m2 = variant('p2m2', { market: { 2: 2, 3: 4, 4: 5 } }, V4);
VARIANTS.p2m4 = variant('p2m4', { market: { 2: 4, 3: 4, 4: 5 } }, V4);
VARIANTS.p3s16 = variant('p3s16', { supply: { 2: 20, 3: 16, 4: 16 } }, V4);
VARIANTS.p2s14 = variant('p2s14', { supply: { 2: 14, 3: 18, 4: 16 } }, V4);
VARIANTS.p2s16c3 = variant('p2s16c3', { supply: { 2: 16, 3: 18, 4: 16 }, cap: 3, extraRules: ['라운드 선(공급처 큐브 많은 사람)', '한 칸 큐브 상한'] }, V4);
VARIANTS.p2s16short = variant('p2s16short', { supply: { 2: 16, 3: 18, 4: 16 }, gardenSize: { 2: 5, 3: 6, 4: 8 } }, V4);
VARIANTS.p2s16e2 = variant('p2s16e2', { supply: { 2: 16, 3: 18, 4: 16 }, entranceRing: 2 }, V4);
VARIANTS.p2s16m2 = variant('p2s16m2', { supply: { 2: 16, 3: 18, 4: 16 }, market: { 2: 2, 3: 4, 4: 5 } }, V4);
VARIANTS.p2s16long = variant('p2s16long', { supply: { 2: 16, 3: 18, 4: 16 }, gardenSize: { 2: 7, 3: 6, 4: 8 } }, V4);
VARIANTS.p2s16h0 = variant('p2s16h0', { supply: { 2: 16, 3: 18, 4: 16 }, startHand: 0 }, V4);
