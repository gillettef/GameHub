// 테크 웹 뼈대(중심·6방향·3고리 줄기)와 곁가지 36개 (Rules.md 6절)
import type { Direction, Doctrine, Instant, Mods, Ring, TwigDef } from '../types';

export const CORE_ID = 'core';
export const trunkId = (dir: string, ring: number) => `t:${dir}:${ring}`;
export const twigNodeId = (twigDefId: string) => `w:${twigDefId}`;

function tw(dir: Direction, ring: Ring, n: 'a' | 'b', name: string, doctrine: Doctrine, points: number, effect: { instant?: Instant; mods?: Partial<Mods> }): TwigDef {
  return { id: `${dir}${ring}${n}`, ring, name, doctrine, points, ...effect };
}

/**
 * 곁가지 36개 — 줄기마다 2개.
 * 1·2고리: 그 줄기의 계열과 관련. 3고리: 그 줄기 + 양옆 방향 줄기의 능력이 엮이는 교차 효과(양옆 3고리 줄기 필요).
 * 방향 순서(DIRECTIONS)에서 이웃: 농업-문화-학술-동력-산업-방위-농업
 */
const AGRI: TwigDef[] = [
  tw('agri', 1, 'a', '봉인 종자고', 'ark', 1, { mods: { income: { food: 1 } } }),
  tw('agri', 1, 'b', '토양 균사', 'symbiont', 1, { mods: { income: { food: 1 } }, instant: { gain: { food: 1 } } }),
  tw('agri', 2, 'a', '저장 곡창', 'ark', 1, { mods: { foodUpkeep: 1, income: { prod: 1 } } }),
  tw('agri', 2, 'b', '공생 배양조', 'symbiont', 2, { mods: { buildingBonus: { farm: 1 } } }),
  // 양옆: 문화·방위
  tw('agri', 3, 'a', '수확 축제', 'ark', 2, { mods: { buildingBonus: { farm: 1, hall: 1 } } }),
  tw('agri', 3, 'b', '둔전 부대', 'symbiont', 1, { mods: { buildingBonus: { farm: 1 }, unitPower: { guard: 1 } } }),
];

const CULTURE: TwigDef[] = [
  tw('culture', 1, 'a', '이주 기록관', 'ark', 1, { instant: { gain: { culture: 2 } } }),
  tw('culture', 1, 'b', '토착 언어', 'symbiont', 1, { mods: { health: 1 }, instant: { gain: { culture: 1 } } }),
  tw('culture', 2, 'a', '공동체 의회', 'ark', 1, { mods: { buildingBonus: { hall: 1 } } }),
  tw('culture', 2, 'b', '토착 의례', 'symbiont', 2, { mods: { income: { culture: 1 } } }),
  // 양옆: 농업·학술
  tw('culture', 3, 'a', '두 번째 고향', 'ark', 2, { mods: { buildingBonus: { hall: 1, lab: 1 } } }),
  tw('culture', 3, 'b', '균사 도시', 'symbiont', 1, { mods: { health: 2, foodUpkeep: 1, buildingBonus: { hall: 1 } } }),
];

const ACADEMIC: TwigDef[] = [
  tw('academic', 1, 'a', '연산 코어', 'synth', 1, { mods: { income: { sci: 1 } } }),
  tw('academic', 1, 'b', '이주민 학교', 'ark', 1, { instant: { gain: { sci: 3 } } }),
  tw('academic', 2, 'a', '양자 연구망', 'synth', 1, { mods: { researchDiscount: 2 } }),
  tw('academic', 2, 'b', '현장 실험실', 'ark', 1, { mods: { buildingBonus: { lab: 1 } } }),
  // 양옆: 문화·동력
  tw('academic', 3, 'a', '의식 업로드', 'synth', 2, { mods: { buildingBonus: { lab: 1, power: 1 } } }),
  tw('academic', 3, 'b', '지구 신호 증폭', 'ark', 1, { mods: { sight: 1, income: { culture: 1 } } }),
];

const POWER: TwigDef[] = [
  tw('power', 1, 'a', '축전 격자', 'synth', 1, { mods: { income: { energy: 1 } } }),
  tw('power', 1, 'b', '생체 발광', 'symbiont', 1, { mods: { income: { energy: 1 } }, instant: { gain: { energy: 1 } } }),
  tw('power', 2, 'a', '전력망 확장', 'synth', 1, { mods: { buildingBonus: { power: 1 }, income: { prod: 1 } } }),
  tw('power', 2, 'b', '지열 공명', 'symbiont', 1, { mods: { sporeCap: 3, income: { sci: 1 } } }),
  // 양옆: 학술·산업
  tw('power', 3, 'a', '궤도 제조소', 'synth', 2, { mods: { buildingBonus: { power: 1, workshop: 1 } } }),
  tw('power', 3, 'b', '지열 순환로', 'symbiont', 1, { mods: { sporeCap: 4, buildingBonus: { lab: 1 } } }),
];

const INDUSTRY: TwigDef[] = [
  tw('industry', 1, 'a', '조립 로봇', 'synth', 1, { mods: { income: { prod: 1 } } }),
  tw('industry', 1, 'b', '광석 분해', 'symbiont', 1, { mods: { income: { prod: 1 } }, instant: { gain: { prod: 1 } } }),
  tw('industry', 2, 'a', '나노 공정', 'synth', 2, { mods: { buildingBonus: { workshop: 1 } } }),
  tw('industry', 2, 'b', '순환 재활용', 'symbiont', 1, { mods: { unitUpgradeDiscount: 1, income: { prod: 1 } } }),
  // 양옆: 동력·방위
  tw('industry', 3, 'a', '자기 복제 공장', 'synth', 2, { mods: { buildingBonus: { workshop: 1 }, unitCap: 1 } }),
  tw('industry', 3, 'b', '재생 공장', 'symbiont', 1, { mods: { buildingBonus: { workshop: 1 }, income: { energy: 1 } } }),
];

const DEFENSE: TwigDef[] = [
  tw('defense', 1, 'a', '전투 기계', 'synth', 1, { mods: { might: 1 } }),
  tw('defense', 1, 'b', '방벽 설계', 'ark', 1, { mods: { unitPower: { guard: 1 } } }),
  tw('defense', 2, 'a', '자율 드론', 'synth', 1, { mods: { raidBonus: 1, might: 1 } }),
  tw('defense', 2, 'b', '요새 포좌', 'ark', 1, { mods: { unitPower: { battery: 1 }, might: 2 } }),
  // 양옆: 산업·농업
  tw('defense', 3, 'a', '무장 공장', 'synth', 1, { mods: { unitPower: { battery: 1 }, buildingBonus: { workshop: 1 } } }),
  tw('defense', 3, 'b', '보급 방벽', 'ark', 1, { mods: { unitPower: { guard: 1, rider: 1 }, foodUpkeep: 1 } }),
];

const ALL: TwigDef[] = [...AGRI, ...CULTURE, ...ACADEMIC, ...POWER, ...INDUSTRY, ...DEFENSE];

export const TWIG_DEFS: Record<string, TwigDef> = Object.fromEntries(ALL.map((t) => [t.id, t]));

/** 줄기(방향·고리)에 붙는 곁가지 id 2개 */
export function twigIdsOf(dir: Direction, ring: Ring): [string, string] {
  return [`${dir}${ring}a`, `${dir}${ring}b`];
}
