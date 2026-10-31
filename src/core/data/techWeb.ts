// 테크 웹 뼈대(중심·6방향·3고리 줄기)와 고리별 곁가지 풀 (Rules.md 6절)
import type { Doctrine, Instant, Mods, Ring, TwigDef } from '../types';

export const CORE_ID = 'core';
export const trunkId = (dir: string, ring: number) => `t:${dir}:${ring}`;
export const twigNodeId = (twigDefId: string) => `w:${twigDefId}`;

function tw(id: string, ring: Ring, name: string, doctrine: Doctrine, points: number, effect: { instant?: Instant; mods?: Partial<Mods> }): TwigDef {
  return { id, ring, name, doctrine, points, ...effect };
}

/** 고리 1 곁가지 풀: 15개(노선별 5) */
const RING1: TwigDef[] = [
  tw('r1a1', 1, '봉인 종자고', 'ark', 1, { mods: { health: 1 } }),
  tw('r1a2', 1, '이주 기록관', 'ark', 1, { instant: { gain: { culture: 2 } } }),
  tw('r1a3', 1, '방벽 설계', 'ark', 1, { mods: { unitPower: { guard: 1 } } }),
  tw('r1a4', 1, '배급 규약', 'ark', 1, { mods: { foodUpkeep: 1 } }),
  tw('r1a5', 1, '정착 서약', 'ark', 1, { instant: { colonist: 1 } }),
  tw('r1s1', 1, '토양 균사', 'symbiont', 1, { mods: { income: { food: 1 } } }),
  tw('r1s2', 1, '포자 채집', 'symbiont', 1, { instant: { gain: { food: 3 } } }),
  tw('r1s3', 1, '야수 길들이기', 'symbiont', 1, { mods: { unitPower: { rider: 1 } } }),
  tw('r1s4', 1, '안개 적응', 'symbiont', 1, { mods: { sporeCap: 2 } }),
  tw('r1s5', 1, '생태 관찰', 'symbiont', 1, { instant: { gain: { sci: 2 } } }),
  tw('r1y1', 1, '축전 격자', 'synth', 1, { mods: { income: { energy: 1 } } }),
  tw('r1y2', 1, '광석 분해', 'synth', 1, { instant: { gain: { prod: 3 } } }),
  tw('r1y3', 1, '정화 필터', 'synth', 1, { mods: { sporeCap: 2 } }),
  tw('r1y4', 1, '신경 단자', 'synth', 1, { instant: { gain: { sci: 2 } } }),
  tw('r1y5', 1, '조립 로봇', 'synth', 1, { instant: { gain: { energy: 3 } } }),
];

/** 고리 2 곁가지 풀: 18개(노선별 6) */
const RING2: TwigDef[] = [
  tw('r2a1', 2, '공동체 의회', 'ark', 1, { mods: { health: 1 } }),
  tw('r2a2', 2, '지구 박물관', 'ark', 2, { instant: { gain: { culture: 3 } } }),
  tw('r2a3', 2, '요새 포좌', 'ark', 1, { mods: { unitPower: { battery: 1 } } }),
  tw('r2a4', 2, '순수 혈통 기록', 'ark', 1, { mods: { income: { culture: 1 } } }),
  tw('r2a5', 2, '격리 구역', 'ark', 1, { mods: { might: 1, health: 1 } }),
  tw('r2a6', 2, '이주민 학교', 'ark', 1, { instant: { colonist: 1, gain: { sci: 2 } } }),
  tw('r2s1', 2, '공생 배양조', 'symbiont', 1, { mods: { income: { food: 1 } } }),
  tw('r2s2', 2, '토착 언어', 'symbiont', 2, { instant: { gain: { culture: 3 } } }),
  tw('r2s3', 2, '무리 신호', 'symbiont', 1, { mods: { unitPower: { rider: 1 } } }),
  tw('r2s4', 2, '포자 호흡', 'symbiont', 1, { mods: { sporeCap: 3 } }),
  tw('r2s5', 2, '숲의 기억', 'symbiont', 1, { mods: { health: 1 } }),
  tw('r2s6', 2, '생체 발광', 'symbiont', 1, { mods: { income: { energy: 1 } } }),
  tw('r2y1', 2, '연산 코어', 'synth', 1, { mods: { income: { sci: 1 } } }),
  tw('r2y2', 2, '나노 공정', 'synth', 2, { instant: { gain: { prod: 4 } } }),
  tw('r2y3', 2, '강화 외골격', 'synth', 1, { mods: { might: 1 } }),
  tw('r2y4', 2, '포자 소각로', 'synth', 1, { mods: { sporeCap: 3 } }),
  tw('r2y5', 2, '자율 드론', 'synth', 1, { mods: { raidBonus: 1 } }),
  tw('r2y6', 2, '전력망 확장', 'synth', 1, { mods: { income: { energy: 1 } } }),
];

/** 고리 3 곁가지 풀: 18개(노선별 6) */
const RING3: TwigDef[] = [
  tw('r3a1', 3, '두 번째 고향', 'ark', 2, { mods: { income: { culture: 1 } } }),
  tw('r3a2', 3, '헌법 석판', 'ark', 1, { mods: { health: 2 } }),
  tw('r3a3', 3, '수호 군단', 'ark', 1, { mods: { unitPower: { guard: 1, battery: 1 } } }),
  tw('r3a4', 3, '기억 보관소', 'ark', 2, { instant: { gain: { culture: 4 } } }),
  tw('r3a5', 3, '지구 신호 증폭', 'ark', 1, { mods: { sight: 1 } }),
  tw('r3a6', 3, '세대 계획', 'ark', 1, { mods: { income: { food: 1, prod: 1 } } }),
  tw('r3s1', 3, '행성 신경망', 'symbiont', 2, { mods: { income: { food: 1, sci: 1 } } }),
  tw('r3s2', 3, '거대 생물 동맹', 'symbiont', 1, { mods: { unitPower: { rider: 1 }, might: 1 } }),
  tw('r3s3', 3, '균사 도시', 'symbiont', 1, { mods: { health: 2 } }),
  tw('r3s4', 3, '포자 공명', 'symbiont', 2, { instant: { gain: { culture: 4 } } }),
  tw('r3s5', 3, '토착 예지', 'symbiont', 1, { mods: { sight: 1 } }),
  tw('r3s6', 3, '번식 주기', 'symbiont', 1, { instant: { colonist: 1, gain: { food: 3 } } }),
  tw('r3y1', 3, '의식 업로드', 'synth', 2, { mods: { income: { sci: 2 } } }),
  tw('r3y2', 3, '궤도 제조소', 'synth', 1, { mods: { sight: 1 } }),
  tw('r3y3', 3, '전투 기계', 'synth', 1, { mods: { might: 2 } }),
  tw('r3y4', 3, '대기 정화탑', 'synth', 1, { mods: { sporeCap: 4, health: 1 } }),
  tw('r3y5', 3, '자기 복제 공장', 'synth', 2, { instant: { gain: { prod: 5 } } }),
  tw('r3y6', 3, '양자 연구망', 'synth', 1, { mods: { researchDiscount: 1 } }),
];

export const TWIG_POOLS: Record<Ring, TwigDef[]> = { 1: RING1, 2: RING2, 3: RING3 };
export const TWIG_DEFS: Record<string, TwigDef> = Object.fromEntries(
  [...RING1, ...RING2, ...RING3].map((t) => [t.id, t]),
);
