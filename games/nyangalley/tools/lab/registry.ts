/** 이름 → 규칙 후보. 실험하면서 여기에 추가한다 */
import type { ChoreId, LabRules } from './engine.js';
import { BASE, GOALS_V2, SPECIES_V2, at, patchSpecies, variant } from './variants.js';

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
const SPECIES_V3 = patchSpecies(SPECIES_V2, {
  dandelion: { ability: { kind: 'seed', value: 1, range: 2, count: 1 }, pattern: [[0, 0, 1], at(0, 1), at(3, 1)] },
  mugunghwa: { ability: { kind: 'bloom', value: 1 } },
  mushroom: { pattern: [[0, 0, 2]], ability: { kind: 'wither', value: 2 } },
  pine: { pattern: [[0, 0, 3], at(0, 1), at(3, 1)] },
  bamboo: { pattern: [[0, 0, 1], at(0, 1), at(1, 1), at(3, 1)], ability: { kind: 'cluster', value: 2 } },
  ivy: { pattern: [[0, 0, 2], at(0, 1)] },
  rapeseed: { pattern: [[0, 0, 2], at(0, 1), at(2, 1), at(4, 1)], ability: { kind: 'fertileRing', value: 1 } },
});
VARIANTS.sp3 = variant('sp3', { species: SPECIES_V3 });


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
const SPECIES_V4 = SPECIES_V3.filter((s) => BASE9.has(s.id)).map((s) => (s.id === 'pine' ? { ...s, tags: ['tree' as const] } : s));
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

// v5 (2026-10-16 채택, 지금 규칙): v4 + 2인 큐브 16
VARIANTS.v5 = variant('v5', { supply: { 2: 16, 3: 18, 4: 16 } }, V4);

// 2026-10-17 선 규칙 재검토: 2인 ABAB(선 고정) vs ABBA(선 교대) vs 지금(공급처 큐브 최다 선)
VARIANTS.v5fixed = variant('v5fixed', { firstPlayer: 'fixed' }, VARIANTS.v5!);
VARIANTS.v5rotate = variant('v5rotate', { firstPlayer: 'rotate' }, VARIANTS.v5!);

// 2026-10-18 사용자 지시: 마켓 2장 + 카드 더미 뒷면 1장 가져오기
VARIANTS.v6 = variant('v6', { market: { 2: 2, 3: 2, 4: 2 }, blindDraw: true }, VARIANTS.v5!);
VARIANTS.v6m = variant('v6m', { market: { 2: 2, 3: 3, 4: 4 }, blindDraw: true }, VARIANTS.v5!);
VARIANTS.v5m2 = variant('v5m2', { market: { 2: 2, 3: 2, 4: 2 } }, VARIANTS.v5!);

// 2026-11-23 2인 재평가: v6 2인 약점(자리 편차·접전·선두 교체·목표 비중) 후보
const V6 = VARIANTS.v6!;
VARIANTS.p2g2 = variant('p2g2', { goalCount: 2 }, V6);
VARIANTS.p2c3 = variant('p2c3', { cap: 3, extraRules: ['라운드 선(공급처 큐브 많은 사람)', '한 칸 큐브 상한'] }, V6);
VARIANTS.p2v6s14 = variant('p2v6s14', { supply: { 2: 14, 3: 18, 4: 16 } }, V6);
VARIANTS.p2v6s18 = variant('p2v6s18', { supply: { 2: 18, 3: 18, 4: 16 } }, V6);
VARIANTS.p2v6m3 = variant('p2v6m3', { market: { 2: 3, 3: 2, 4: 2 } }, V6);
VARIANTS.p2nbg2 = variant('p2nbg2', { goalCount: 2 }, VARIANTS.v5m2!);

// 2026-11-26 「세 번 피는 정원」: 봄·여름·가을 계절 결산(목표 1장씩 + 개화). Contest.md 5.3
const SEASON_ENDS = { 2: [4, 8, 12], 3: [4, 7, 10], 4: [4, 7, 10] };
const SEASON_RULES = ['라운드 선(공급처 큐브 많은 사람)', '계절 결산'];
const HOOK_BLOOM = '꽃이 필 때 뿌리를 잡은 사람이 갖는다(계절마다 주인 없는 식물이 점수가 됨)';
const seasonal = (name: string, bloom: number, goalTiming: 'season' | 'end', reveal: 'all' | 'season' = 'all', from = V6) =>
  variant(name, { seasons: { ends: SEASON_ENDS, bloom, goalTiming, reveal }, extraRules: SEASON_RULES, hooks: [...(from.hooks ?? []), HOOK_BLOOM] }, from);
VARIANTS.s1 = seasonal('s1', 1, 'season');
VARIANTS.s2 = seasonal('s2', 2, 'season');
VARIANTS.s0 = seasonal('s0', 0, 'season');
VARIANTS.s1end = seasonal('s1end', 1, 'end');
VARIANTS.s1rev = seasonal('s1rev', 1, 'season', 'season');
VARIANTS.s1nb = seasonal('s1nb', 1, 'season', 'all', VARIANTS.v5m2!);

// 2026-11-26 A안 「행동 고르기」: 명당 놓기 / 담 넘기 / 모여라. 지금 규칙(v6 + 두 단계 놓기) 위에. 끝은 라운드 수
const ACT_RULES = ['라운드 선(공급처 큐브 많은 사람)', '행동 고르기(담 넘기)', '행동 고르기(모여라)'];
const acts = (name: string, a: Partial<NonNullable<LabRules['actions']>>, extra: Partial<LabRules> = {}) =>
  variant(name, { actions: { move: 2, gather: 3, perCell: 3, rounds: { 2: 12, 3: 10, 4: 10 }, ...a }, extraRules: ACT_RULES, ...extra }, V6);
VARIANTS.a1 = acts('a1', {});
VARIANTS.a1r14 = acts('a1r14', { rounds: { 2: 14, 3: 12, 4: 12 } });
VARIANTS.a1m3 = acts('a1m3', { move: 3 });
VARIANTS.a1g2 = acts('a1g2', { gather: 2 });
VARIANTS.a1gt = acts('a1gt', { gatherTake: true, handMax: 2 });
VARIANTS.a1m1 = acts('a1m1', { move: 1, gather: 2 });
VARIANTS.a1nr = acts('a1nr', { noRepeat: true });
VARIANTS.a1nr14 = acts('a1nr14', { noRepeat: true, rounds: { 2: 14, 3: 12, 4: 12 } });
VARIANTS.a2 = acts('a2', { gatherMode: 'regroup' });
VARIANTS.a2nr = acts('a2nr', { gatherMode: 'regroup', noRepeat: true });
VARIANTS.a2m1 = acts('a2m1', { gatherMode: 'regroup', move: 1 });
// 쉬는 고양이 경제: 놓기는 쉬는 고양이로만(데려오기 없음) + 낮잠(내 칸 고양이 최대 3마리 쉬게)
VARIANTS.e1 = acts('e1', { gatherMode: 'nap', noRelocate: true });
VARIANTS.e1g2 = acts('e1g2', { gatherMode: 'nap', noRelocate: true, gather: 2 });
VARIANTS.e1g4 = acts('e1g4', { gatherMode: 'nap', noRelocate: true, gather: 4 });
VARIANTS.e1m1 = acts('e1m1', { gatherMode: 'nap', noRelocate: true, move: 1 });
VARIANTS.e1s20 = acts('e1s20', { gatherMode: 'nap', noRelocate: true }, { supply: { 2: 20, 3: 22, 4: 20 } });

// 2026-11-26 C안 「골목 일과」: 라운드마다 (인원+1)장 펼쳐 선부터 1장씩 고르기. 끝은 라운드 수
const CHORE_RULES = ['라운드 선(공급처 큐브 많은 사람)', '골목 일과 고르기', '일과 문장 6개'];
const chores = (name: string, set: ChoreId[], a: Partial<NonNullable<LabRules['actions']>> = {}, extra: Partial<LabRules> = {}) =>
  variant(name, { chores: { set }, actions: { move: 2, gather: 0, perCell: 3, rounds: { 2: 12, 3: 10, 4: 10 }, ...a }, extraRules: CHORE_RULES, ...extra }, V6);
const ALL_CHORES: ChoreId[] = ['bread', 'peek', 'roam', 'move', 'call', 'boss'];
VARIANTS.c1 = chores('c1', ALL_CHORES);
VARIANTS.c1r14 = chores('c1r14', ALL_CHORES, { rounds: { 2: 14, 3: 12, 4: 12 } });
VARIANTS.c1nocall = chores('c1nocall', ['bread', 'peek', 'roam', 'move', 'boss']);
VARIANTS.c1nomove = chores('c1nomove', ['bread', 'peek', 'roam', 'call', 'boss']);
VARIANTS.c2 = chores('c2', ALL_CHORES, { move: 3 }, {});
VARIANTS.c2.chores = { set: ALL_CHORES, peekMode: 'look3', callBonus: 1 };
VARIANTS.c3 = chores('c3', ALL_CHORES, { move: 2, moveTimes: 2 }, {});
VARIANTS.c3.chores = { set: ALL_CHORES, peekMode: 'look3', callBonus: 2 };
VARIANTS.c4 = chores('c4', ALL_CHORES, { move: 2, moveTimes: 2 }, {});
VARIANTS.c4.chores = { set: ALL_CHORES, peekMode: 'look3', callBonus: 1, callTurn: true };
VARIANTS.c5 = chores('c5', ALL_CHORES, { move: 2, moveTimes: 2 }, {});
VARIANTS.c5.chores = { set: ALL_CHORES, peekMode: 'look3', callBonus: 1, callTurn: true, roamRange: 2, callTake: true };

// 2026-11-27 사용자 제안 「행동 하나」: 일과 삭제. 차례마다 가져오기(2장, 손 최대 3) / 놓기(1장) / 부르기 중 하나. 끝은 라운드 수
const ONE_RULES = ['라운드 선(공급처 큐브 많은 사람)', '행동 하나(가져오기·놓기)', '행동 하나(부르기)'];
const oneAct = (name: string, o: Partial<NonNullable<LabRules['one']>>, rounds: Record<number, number>, extra: Partial<LabRules> = {}) =>
  variant(
    name,
    { one: { take: 2, handMax: 3, call: true, callBonus: 0, callTurn: true, ...o }, actions: { move: 0, gather: 0, perCell: 0, rounds }, extraRules: o.call === false ? ONE_RULES.slice(0, 2) : ONE_RULES, ...extra },
    V6,
  );
const R18 = { 2: 18, 3: 15, 4: 15 };
const R16 = { 2: 16, 3: 13, 4: 13 };
const R20 = { 2: 20, 3: 17, 4: 17 };
VARIANTS.o0 = oneAct('o0', { call: false }, R18);
VARIANTS.o1 = oneAct('o1', {}, R18);
VARIANTS.o1r16 = oneAct('o1r16', {}, R16);
VARIANTS.o1r20 = oneAct('o1r20', {}, R20);
VARIANTS.o1b = oneAct('o1b', { callBonus: 1 }, R18);
VARIANTS.o1nt = oneAct('o1nt', { callTurn: false }, R18);
VARIANTS.o1once = oneAct('o1once', { callOnce: true }, R18);
VARIANTS.o1h4 = oneAct('o1h4', { handMax: 4 }, R18);
VARIANTS.o1br20 = oneAct('o1br20', { callBonus: 1 }, R20);
VARIANTS.o1r22 = oneAct('o1r22', {}, { 2: 22, 3: 18, 4: 18 });
