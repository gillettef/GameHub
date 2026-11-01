// 작은 카드 아랫부분에 넣는 효과 요약(아이콘 + 수치). 긴 설명은 누르면 열리는 시트에서
import type { ReactNode } from 'react';
import type { CardDef, Instant, Mods, QuestDef, UnitKind } from '../../core/types';
import { DOCTRINES, RES_KEYS } from '../../core/types';
import { DOCTRINE_NAMES } from '../../core/data/constants';
import { METRIC_NAMES } from '../describe';
import { Icon, type IconName } from './Icon';
import styles from './CardBrief.module.css';

const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);

type Chip = { icon?: IconName; color?: string; text: string };

function modsChips(m: Partial<Mods> | undefined): Chip[] {
  if (!m) return [];
  const out: Chip[] = [];
  if (m.income) for (const k of RES_KEYS) if (m.income[k]) out.push({ icon: k, color: `var(--res-${k})`, text: sign(m.income[k]!) });
  if (m.health) out.push({ icon: 'health', text: sign(m.health) });
  if (m.might) out.push({ icon: 'might', color: 'var(--danger)', text: sign(m.might) });
  if (m.command) out.push({ icon: 'command', text: sign(m.command) });
  if (m.defense) out.push({ icon: 'defense', color: 'var(--danger)', text: sign(m.defense) });
  if (m.sight) out.push({ icon: 'satellite', text: sign(m.sight) });
  if (m.sporeCap) out.push({ icon: 'spore', text: sign(m.sporeCap) });
  if (m.raidBonus) out.push({ icon: 'rider', color: 'var(--danger)', text: sign(m.raidBonus) });
  if (m.buildingBonus) for (const [k, v] of Object.entries(m.buildingBonus)) if (v) out.push({ icon: k as IconName, text: sign(v) });
  if (m.unitPower) for (const [k, v] of Object.entries(m.unitPower)) if (v) out.push({ icon: k as UnitKind, color: 'var(--danger)', text: sign(v) });
  if (m.researchDiscount) out.push({ icon: 'sci', color: 'var(--res-sci)', text: `−${m.researchDiscount}` });
  if (m.trunkDiscount) out.push({ text: `줄기−${m.trunkDiscount}` });
  if (m.buildingCap) out.push({ text: `건물${sign(m.buildingCap)}` });
  if (m.unitCap) out.push({ text: `유닛${sign(m.unitCap)}` });
  if (m.foodUpkeep) out.push({ icon: 'food', color: 'var(--res-food)', text: `소비−${m.foodUpkeep}` });
  if (m.unitUpgradeDiscount) out.push({ text: `업글−${m.unitUpgradeDiscount}` });
  return out;
}

function instantChips(e: Instant | undefined): Chip[] {
  if (!e) return [];
  const out: Chip[] = [];
  if (e.gain) for (const k of RES_KEYS) if (e.gain[k]) out.push({ icon: k, color: `var(--res-${k})`, text: sign(e.gain[k]!) });
  if (e.doctrine) for (const [d, n] of Object.entries(e.doctrine)) if (n) out.push({ icon: d as IconName, color: `var(--${d})`, text: sign(n) });
  if (e.colonist) out.push({ icon: 'colonist', text: sign(e.colonist) });
  return out;
}

/** 작은 카드에 들어가는 칩 수 상한 — 넘치면 "+N" 으로 줄인다 */
const MAX_CHIPS = 4;

function Chips({ chips, lead, className }: { chips: Chip[]; lead?: ReactNode; className?: string }) {
  if (!chips.length && !lead) return null;
  const max = lead ? MAX_CHIPS - 1 : MAX_CHIPS;
  const shown = chips.length > max ? chips.slice(0, max - 1) : chips;
  const rest = chips.length - shown.length;
  return (
    <span className={`${styles.brief} ${className ?? ''}`}>
      {lead}
      {shown.map((c, i) => (
        <span key={i} className={styles.chip} style={c.color ? { color: c.color } : undefined}>
          {c.icon && <Icon name={c.icon} size={12} />}
          {c.text}
        </span>
      ))}
      {rest > 0 && <span className={styles.chip}>…+{rest}</span>}
    </span>
  );
}

/** 퀘스트 트랙·보드의 카드 요약 */
export function CardBrief({ card }: { card: CardDef }) {
  if (card.type === 'pioneer')
    return (
      <Chips
        chips={modsChips(card.mods)}
        lead={
          <span className={styles.chip} style={{ color: `var(--${card.doctrine})` }}>
            <Icon name={card.doctrine} size={12} />
          </span>
        }
      />
    );
  if (card.type === 'legacy')
    return (
      <Chips
        chips={modsChips(card.mods)}
        className={styles.legacy}
        lead={
          <span className={styles.chip} style={{ color: 'var(--res-culture)' }}>
            <Icon name="culture" size={12} />
            {card.points}
          </span>
        }
      />
    );
  if (card.type === 'raid') {
    const res: Record<string, IconName> = { lootFood: 'food', lootProd: 'prod', stealSci: 'sci', stealEnergy: 'energy' };
    const chips: Chip[] = card.effects.map((e) => ({ icon: res[e], color: `var(--res-${res[e]})`, text: '' }));
    if (card.bonus) chips.push({ text: `+${card.bonus}` });
    return <Chips chips={chips} lead={<span className={styles.chip} style={{ color: 'var(--danger)' }}><Icon name="might" size={12} />{sign(card.atk)}</span>} />;
  }
  if (card.type === 'conflict') {
    const loss: Record<string, Chip> = { culture: { icon: 'culture', color: 'var(--res-culture)', text: '−' }, building: { icon: 'hall', text: '↓' }, doctrine: { text: '노선−' } };
    return <Chips chips={[loss[card.loss]]} lead={<span className={styles.chip} style={{ color: 'var(--danger)' }}><Icon name="might" size={12} />{sign(card.atk)}</span>} />;
  }
  return <Chips chips={instantChips(card.instant)} />;
}

/** 위성·주둔지처럼 영구 수정치만 있는 카드 */
export function ModsBrief({ mods }: { mods: Partial<Mods> | undefined }) {
  return <Chips chips={modsChips(mods)} />;
}

const THREAT_TARGETS: Record<string, string> = { weakest: '최약 1명', weakest2: '하위 2명', energyMost: '에너지 최다', all: '전원' };

/** 퀘스트 카드: 가운데에 조건·대상, 아래 노선 칸 3개(방주·공생·합성)에 보상 점수 */
export function QuestBrief({ q }: { q: QuestDef }) {
  let line = '';
  if (q.kind === 'judge' || q.kind === 'contest') line = q.cond.map((c) => `${METRIC_NAMES[c.metric]} ${c.min}+`).join(' · ');
  else if (q.kind === 'threat') line = `대상 ${THREAT_TARGETS[q.target] ?? DOCTRINE_NAMES[q.target as keyof typeof DOCTRINE_NAMES]}`;
  else if (q.kind === 'patron') line = '주둔지 제안';
  else if (q.kind === 'fruition') line = `${DOCTRINE_NAMES[q.doctrine]} 결실`;
  const opts = q.kind === 'judge' || q.kind === 'contest' ? q.options : [];
  return (
    <>
      {line && <span className={styles.questLine}>{line}</span>}
      {opts.length > 0 &&
        DOCTRINES.map((d, i) => {
          const o = opts.find((x) => x.doctrine === d);
          return o ? (
            <span key={d} className={styles.opt} style={{ left: `${7.2 + i * 29.6}%`, color: `var(--${d})` }}>
              +{o.points}
            </span>
          ) : null;
        })}
    </>
  );
}
