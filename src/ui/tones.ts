// 화면 색 규칙: 연구·카드로 얻는 것의 색(tokens.css 변수). 테크 웹 배지·효과 글자가 같이 쓴다
import type { Direction, Res, TwigDef } from '../core/types';
import { BUILDING_RES } from '../core/data/constants';

export const RES_TONE: Record<keyof Res, string> = {
  food: 'var(--res-food)',
  prod: 'var(--res-prod)',
  energy: 'var(--res-energy)',
  sci: 'var(--res-sci)',
  culture: 'var(--res-culture)',
};

/** 자원 밖 효과의 색 — 군사(방위력·유닛 전력·습격·방위 행동)는 위험색 */
export const EFFECT_TONE = {
  military: 'var(--danger)',
  health: 'var(--eff-health)',
  spore: 'var(--eff-spore)',
  colonist: 'var(--eff-colonist)',
  sight: 'var(--eff-sight)',
} as const;

/** 방향(줄기)이 여는 것의 색: 농업=식량, 산업=생산, 동력=에너지, 학술=과학, 문화=문화, 방위=방위 */
export const DIRECTION_TONE: Record<Direction, string> = {
  agri: RES_TONE.food,
  industry: RES_TONE.prod,
  power: RES_TONE.energy,
  academic: RES_TONE.sci,
  culture: RES_TONE.culture,
  defense: EFFECT_TONE.military,
};

/** 곁가지가 주는 것의 색: 정착민 → 자원(즉시·생산 단계) → 군사 → 건강 → 포자 안개 → 시야 → 비용 할인 순으로 첫 효과 */
export function twigTone(t: TwigDef): string {
  const { instant: i, mods: m } = t;
  if (i?.colonist) return EFFECT_TONE.colonist;
  const res = (Object.keys(RES_TONE) as (keyof Res)[]).find((k) => i?.gain?.[k] || m?.income?.[k]);
  if (res) return RES_TONE[res];
  const bb = m?.buildingBonus && (Object.keys(m.buildingBonus) as (keyof typeof BUILDING_RES)[]).find((k) => m.buildingBonus![k]);
  if (bb) return RES_TONE[BUILDING_RES[bb]];
  if (m?.might || m?.raidBonus || (m?.unitPower && Object.values(m.unitPower).some(Boolean))) return EFFECT_TONE.military;
  if (m?.health) return EFFECT_TONE.health;
  if (m?.sporeCap) return EFFECT_TONE.spore;
  if (m?.sight) return EFFECT_TONE.sight;
  if (m?.foodUpkeep) return RES_TONE.food;
  if (m?.researchDiscount || m?.trunkDiscount) return RES_TONE.sci;
  return `var(--${t.doctrine})`;
}
