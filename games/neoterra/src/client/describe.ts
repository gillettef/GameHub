// 효과·조건·카드를 화면용 한국어 문장으로 바꾼다
import type { CardDef, Doctrine, Cond, ConflictLoss, RaidEffect, Instant, Loss, Metric, Mods, QuestDef, QuestOption, Res, ThreatTarget } from '../engine/types';
import { RES_KEYS } from '../engine/types';
import { BUILDING_NAMES, BUILDING_RES, CONFLICT_DEFENSE, DOCTRINE_NAMES, RES_NAMES, UNIT_NAMES } from '../engine/data/constants';
import { FACILITY_DEFS } from '../engine/data/quests';
import { EFFECT_TONE, RES_TONE } from './tones';

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function resText(r: Partial<Res> | undefined, prefix = ''): string {
  if (!r) return '';
  return RES_KEYS.filter((k) => r[k])
    .map((k) => `${RES_NAMES[k]} ${prefix}${r[k]}`)
    .join(', ');
}

/** 색을 입힐 수 있는 글자 조각. 이어 붙이면 *Text 문장과 같다 */
export interface Seg {
  text: string;
  tone?: string;
  /** 노선 조각 — 화면에서는 노선 배지(DoctrineTag)로 그린다 */
  doctrine?: Doctrine;
}
const joinSegs = (groups: Seg[][]): Seg[] => groups.flatMap((g, i) => (i ? [{ text: ' · ' }, ...g] : g));
const resSegs = (r: Partial<Res>, fmt: (n: number) => string): Seg[] =>
  RES_KEYS.filter((k) => r[k]).flatMap((k, i) => [...(i ? [{ text: ', ' }] : []), { text: `${RES_NAMES[k]} ${fmt(r[k]!)}`, tone: RES_TONE[k] }]);

export function modsSegs(m: Partial<Mods> | undefined): Seg[] {
  if (!m) return [];
  const out: Seg[][] = [];
  const one = (text: string, tone?: string) => out.push([{ text, tone }]);
  if (m.income) {
    const inc = resSegs(m.income, sign);
    if (inc.length) out.push([{ text: '생산 단계마다 ' }, ...inc]);
  }
  if (m.health) one(`건강 ${sign(m.health)}`, EFFECT_TONE.health);
  if (m.sporeCap) one(`포자 안개 기준치 ${sign(m.sporeCap)}`, EFFECT_TONE.spore);
  if (m.might) one(`방위력 ${sign(m.might)}`, EFFECT_TONE.military);
  if (m.command) one(`지휘 행동 ${sign(m.command)}`);
  if (m.defense) one(`방위 행동 ${sign(m.defense)}`, EFFECT_TONE.military);
  if (m.sight) one(`시야 ${sign(m.sight)}`, EFFECT_TONE.sight);
  if (m.researchDiscount) one(`연구 비용 −${m.researchDiscount}`, RES_TONE.sci);
  if (m.trunkDiscount) one(`줄기 연구 비용 −${m.trunkDiscount}`, RES_TONE.sci);
  if (m.buildingCap) one(`건물 계열 한도 ${sign(m.buildingCap)}`);
  if (m.unitCap) one(`유닛 총수 한도 ${sign(m.unitCap)}`, EFFECT_TONE.military);
  if (m.foodUpkeep) one(`식량 소비 −${m.foodUpkeep}`, RES_TONE.food);
  if (m.unitUpgradeDiscount) one(`유닛 업그레이드 비용 −${m.unitUpgradeDiscount}`, EFFECT_TONE.military);
  if (m.raidBonus) one(`습격 판정 ${sign(m.raidBonus)}`, EFFECT_TONE.military);
  if (m.buildingBonus) {
    for (const [k, v] of Object.entries(m.buildingBonus)) if (v) one(`${BUILDING_NAMES[k as keyof typeof BUILDING_NAMES]} 산출 ${sign(v)}`, RES_TONE[BUILDING_RES[k as keyof typeof BUILDING_RES]]);
  }
  if (m.unitPower) {
    for (const [k, v] of Object.entries(m.unitPower)) if (v) one(`${UNIT_NAMES[k as keyof typeof UNIT_NAMES]} 전력 ${sign(v)}`, EFFECT_TONE.military);
  }
  return joinSegs(out);
}

export function instantSegs(e: Instant | undefined): Seg[] {
  if (!e) return [];
  const out: Seg[][] = [];
  if (e.gain) {
    const g = resSegs(e.gain, (n) => `+${n}`);
    if (g.length) out.push([{ text: '즉시 ' }, ...g]);
  }
  if (e.doctrine) for (const [d, n] of Object.entries(e.doctrine)) if (n) out.push([{ text: `${DOCTRINE_NAMES[d as Doctrine]} 점수 +${n}`, doctrine: d as Doctrine }]);
  if (e.colonist) out.push([{ text: `정착민 +${e.colonist}`, tone: EFFECT_TONE.colonist }]);
  return joinSegs(out);
}

export const segsText = (s: Seg[]) => s.map((x) => x.text).join('');
export const modsText = (m: Partial<Mods> | undefined) => segsText(modsSegs(m));
export const instantText = (e: Instant | undefined) => segsText(instantSegs(e));

export const METRIC_NAMES: Record<Metric, string> = {
  might: '방위력',
  nodes: '연구 노드',
  trunks: '줄기 기술',
  buildingLevels: '건물 레벨 합',
  buildings: '건물 수',
  units: '유닛 수',
  cultureRate: '문화 생산량',
  sciRate: '과학 생산량',
  foodRate: '식량 순생산',
  prodRate: '생산 생산량',
  energy: '보유 에너지',
  satellites: '위성',
  colonists: '정착민',
  halls: '회관',
  labs: '연구소',
  farms: '농장',
  workshops: '제작소',
  powers: '발전소',
  riders: '기동대',
  batteries: '포대',
  doctrineTotal: '노선 점수 합',
  ark: '방주 점수',
  symbiont: '공생 점수',
  synth: '합성 점수',
  legacies: '완성 유산',
  health: '건강',
};

export function condText(c: Cond[]): string {
  return c.map((x) => `${METRIC_NAMES[x.metric]} ${x.min} 이상`).join(', ');
}

export function lossText(l: Loss | undefined): string {
  if (!l) return '';
  const out: string[] = [];
  const r = resText(l.res, '−');
  if (r) out.push(r);
  if (l.downgrade) out.push(`건물 ${l.downgrade}곳 1단계 하락`);
  if (l.colonist) out.push(`정착민 ${l.colonist}명 이탈`);
  return out.join(', ');
}

export function optionSegs(o: QuestOption): Seg[] {
  const g = o.gain ? resSegs(o.gain, (n) => `+${n}`) : [];
  return [{ text: `${DOCTRINE_NAMES[o.doctrine]} +${o.points}`, doctrine: o.doctrine }, ...(g.length ? [{ text: ' · ' }, ...g] : [])];
}
export const optionText = (o: QuestOption) => segsText(optionSegs(o));

const TARGET_NAMES: Record<string, string> = {
  weakest: '방위력 최저 1명',
  weakest2: '방위력 하위 2명',
  energyMost: '에너지 최다 1명',
  all: '전원',
};
export function targetText(t: ThreatTarget): string {
  return TARGET_NAMES[t] ?? `주 노선이 ${DOCTRINE_NAMES[t as keyof typeof DOCTRINE_NAMES]}인 플레이어`;
}

export const QUEST_KIND_NAMES: Record<QuestDef['kind'], string> = {
  judge: '판정형',
  threat: '위협형',
  contest: '경쟁형',
  patron: '주둔지 제안',
  fruition: '결실',
  finale: '종료 기록',
};

export function questSummary(q: QuestDef): string {
  switch (q.kind) {
    case 'judge':
      return `조건: ${condText(q.cond)}${q.failLoss ? ` · 미달 시 ${lossText(q.failLoss)}` : ''}`;
    case 'threat':
      return `위협도 ${q.power} · 대상 ${targetText(q.target)} · 처치 ${resText(q.reward, '+')} · 실패 ${lossText(q.loss)}`;
    case 'contest':
      return `조건: ${condText(q.cond)} · 비용 ${resText(q.cost)} + 지휘 1${q.facility ? ` · 특수 시설 「${FACILITY_DEFS[q.facility].name}」` : ''}`;
    case 'patron':
      return '처리될 때 주둔지 1장을 공개해 지표 최고인 사람에게 제안';
    case 'fruition':
      return `종료 시 ${DOCTRINE_NAMES[q.doctrine]} 단계 × 3 문화, 단계 4 선착 +6 · 나머지 +3`;
    case 'finale':
      return q.text ?? '';
  }
}

/** questSummary 의 색 조각판 — 노선이 들어간 문구만 배지로 나눈다 */
export function questSegs(q: QuestDef): Seg[] {
  if (q.kind === 'fruition')
    return [{ text: '종료 시 ' }, { text: DOCTRINE_NAMES[q.doctrine], doctrine: q.doctrine }, { text: ' 단계 × 3 문화, 단계 4 선착 +6 · 나머지 +3' }];
  if (q.kind === 'threat' && !TARGET_NAMES[q.target]) {
    const [pre, post] = questSummary(q).split(targetText(q.target));
    const d = q.target as Doctrine;
    return [{ text: `${pre}주 노선이 ` }, { text: DOCTRINE_NAMES[d], doctrine: d }, { text: `인 플레이어${post}` }];
  }
  return [{ text: questSummary(q) }];
}

export const CARD_TYPE_NAMES: Record<CardDef['type'], string> = { pioneer: '후원자', legacy: '유산', supply: '자원 팟', raid: '습격', conflict: '분쟁' };
export const RAID_EFFECT_NAMES: Record<RaidEffect, string> = {
  lootProd: '생산 약탈',
  lootFood: '식량 약탈',
  stealSci: '과학 탈취',
  stealEnergy: '에너지 탈취',
  abduct: '정착민 납치',
};
export const CONFLICT_LOSS_NAMES: Record<ConflictLoss, string> = { culture: '문화', building: '건물', doctrine: '노선 점수' };

/** cardText 의 색 조각판 */
export function cardSegs(c: CardDef): Seg[] {
  if (c.type === 'pioneer') return [{ text: `${DOCTRINE_NAMES[c.doctrine]} 성향`, doctrine: c.doctrine }, { text: ' · ' }, ...modsSegs(c.mods)];
  if (c.type === 'legacy') return [{ text: `${c.stages.length}단계(생산 ${c.stages.join('·')}) · 완성 시 ` }, ...modsSegs(c.mods), { text: ` · ${c.points}점` }];
  if (c.type === 'supply') return instantSegs(c.instant);
  return [{ text: cardText(c) }];
}

export function cardText(c: CardDef): string {
  if (c.type === 'pioneer') return `${DOCTRINE_NAMES[c.doctrine]} 성향 · ${modsText(c.mods)}`;
  if (c.type === 'legacy') return `${c.stages.length}단계(생산 ${c.stages.join('·')}) · 완성 시 ${modsText(c.mods)} · ${c.points}점`;
  if (c.type === 'raid') return `습격 · 공격 ${c.atk ? `+${c.atk}` : '±0'} · 성공 시 ${c.effects.map((e) => RAID_EFFECT_NAMES[e]).join('/')}(시대 + 2${c.bonus ? ` + ${c.bonus}` : ''}) · 방위 행동 2`;
  if (c.type === 'conflict') return `분쟁 선포 · 노리는 손실 ${CONFLICT_LOSS_NAMES[c.loss]}${c.atk ? ` · 판정 공격 +${c.atk}` : ''} · 다음 차례 방위 행동 ${CONFLICT_DEFENSE}로 판정`;
  return instantText(c.instant);
}
