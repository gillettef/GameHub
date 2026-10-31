// 효과·조건·카드를 화면용 한국어 문장으로 바꾼다
import type { CardDef, Cond, Instant, Loss, Metric, Mods, QuestDef, QuestOption, Res, ThreatTarget } from '../core/types';
import { RES_KEYS } from '../core/types';
import { DOCTRINE_NAMES, RES_NAMES, UNIT_NAMES } from '../core/data/constants';
import { FACILITY_DEFS } from '../core/data/quests';

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export function resText(r: Partial<Res> | undefined, prefix = ''): string {
  if (!r) return '';
  return RES_KEYS.filter((k) => r[k])
    .map((k) => `${RES_NAMES[k]} ${prefix}${r[k]}`)
    .join(', ');
}

export function modsText(m: Partial<Mods> | undefined): string {
  if (!m) return '';
  const out: string[] = [];
  if (m.income) {
    const inc = RES_KEYS.filter((k) => m.income![k]).map((k) => `${RES_NAMES[k]} ${sign(m.income![k]!)}`);
    if (inc.length) out.push(`생산 단계마다 ${inc.join(', ')}`);
  }
  if (m.health) out.push(`건강 ${sign(m.health)}`);
  if (m.sporeCap) out.push(`포자 안개 기준치 ${sign(m.sporeCap)}`);
  if (m.might) out.push(`방위력 ${sign(m.might)}`);
  if (m.command) out.push(`지휘 행동 ${sign(m.command)}`);
  if (m.defense) out.push(`방위 행동 ${sign(m.defense)}`);
  if (m.sight) out.push(`시야 ${sign(m.sight)}`);
  if (m.researchDiscount) out.push(`연구 비용 −${m.researchDiscount}`);
  if (m.trunkDiscount) out.push(`줄기 연구 비용 −${m.trunkDiscount}`);
  if (m.buildingCap) out.push(`건물 계열 한도 ${sign(m.buildingCap)}`);
  if (m.unitCap) out.push(`유닛 계열 한도 ${sign(m.unitCap)}`);
  if (m.foodUpkeep) out.push(`식량 소비 −${m.foodUpkeep}`);
  if (m.unitUpgradeDiscount) out.push(`유닛 업그레이드 비용 −${m.unitUpgradeDiscount}`);
  if (m.raidBonus) out.push(`습격 판정 ${sign(m.raidBonus)}`);
  if (m.unitPower) {
    for (const [k, v] of Object.entries(m.unitPower)) if (v) out.push(`${UNIT_NAMES[k as keyof typeof UNIT_NAMES]} 전력 ${sign(v)}`);
  }
  return out.join(' · ');
}

export function instantText(e: Instant | undefined): string {
  if (!e) return '';
  const out: string[] = [];
  const g = resText(e.gain, '+');
  if (g) out.push(`즉시 ${g}`);
  if (e.doctrine) for (const [d, n] of Object.entries(e.doctrine)) if (n) out.push(`${DOCTRINE_NAMES[d as keyof typeof DOCTRINE_NAMES]} 점수 +${n}`);
  if (e.colonist) out.push(`정착민 +${e.colonist}`);
  return out.join(' · ');
}

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

export function optionText(o: QuestOption): string {
  const g = resText(o.gain, '+');
  return `${DOCTRINE_NAMES[o.doctrine]} +${o.points}${g ? ` · ${g}` : ''}`;
}

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
  patron: '후원 제안',
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
      return '처리될 때 후원 계약 1장을 공개해 지표 최고인 사람에게 제안';
    case 'fruition':
      return `종료 시 ${DOCTRINE_NAMES[q.doctrine]} 단계 × 3 문화, 단계 4 선착 +6 · 나머지 +3`;
    case 'finale':
      return q.text ?? '';
  }
}

export const CARD_TYPE_NAMES: Record<CardDef['type'], string> = { pioneer: '선구자', legacy: '유산', supply: '보급' };

export function cardText(c: CardDef): string {
  if (c.type === 'pioneer') return `${DOCTRINE_NAMES[c.doctrine]} 성향 · ${modsText(c.mods)}`;
  if (c.type === 'legacy') return `${c.stages.length}단계(생산 ${c.stages.join('·')}) · 완성 시 ${modsText(c.mods)} · ${c.points}점`;
  return instantText(c.instant);
}
