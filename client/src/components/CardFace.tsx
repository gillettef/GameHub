import { memo } from 'react';
import type { CardSpec } from '@astraltab/shared';
import { keywordLabel, kindLabel } from '../game/derived';
import { cx } from '../lib/cx';
import styles from './CardFace.module.css';

/** 마법 효과를 한국어 한 줄로 */
export function effectLabel(spec: CardSpec): string | null {
  const e = spec.effect;
  if (!e) return null;
  switch (e.kind) {
    case 'damage':
      return `즉발 · 반경 ${e.radius} 적 피해 ${e.amount}`;
    case 'heal':
      return `즉발 · 반경 ${e.radius} 아군 회복 ${e.amount}`;
    case 'energy':
      return `즉발 · 에너지 +${e.amount}`;
    case 'persistent':
      return `지속 ${e.durationTurns}턴`;
  }
}

/** 카드 상세 스펙 표 (F011, F017). 0인 항목은 생략한다 */
export const SpecRows = memo(function SpecRows({ spec }: { spec: CardSpec }) {
  const rows: [string, string][] = [];
  rows.push(['비용', String(spec.cost)]);
  rows.push(['시야', String(spec.sight)]);
  rows.push(['점수', String(spec.score)]);
  if (spec.hp > 0) rows.push(['체력', String(spec.hp)]);
  if (spec.attack > 0) rows.push(['공격', String(spec.attack)]);
  if (spec.range > 0) rows.push(['사거리', String(spec.range)]);
  if (spec.production > 0 && spec.kind !== 'core') rows.push(['생산', String(spec.production)]);
  const effect = effectLabel(spec);
  if (effect) rows.push(['효과', effect]);
  if (spec.keywords.length > 0) rows.push(['키워드', spec.keywords.map(keywordLabel).join(', ')]);
  return (
    <dl className={styles.rows}>
      {rows.map(([k, v]) => (
        <div key={k} className={styles.row}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
});

interface CardFaceProps {
  spec: CardSpec;
  selected?: boolean;
  disabled?: boolean;
  /** 낼 수 없는 이유. 있으면 카드 아래에 표시 */
  reason?: string | null;
  onClick?: () => void;
  /** 호버 시 상세 팝업 (F017) */
  hoverDetails?: boolean;
}

/**
 * 손패·덱 빌딩 공용 카드. 비용·시야·점수는 항상 보이고(F011, F017), 종류별 색 띠로 구분한다.
 */
export const CardFace = memo(function CardFace({ spec, selected, disabled, reason, onClick, hoverDetails }: CardFaceProps) {
  return (
    <button
      type="button"
      className={cx(styles.card, selected && styles.selected, disabled && styles.disabled)}
      data-kind={spec.kind}
      aria-pressed={selected ?? false}
      disabled={disabled && !onClick}
      onClick={onClick}
    >
      <span className={styles.stripe} aria-hidden="true" />
      <span className={styles.head}>
        <span className={styles.name}>{spec.name}</span>
        <span className={styles.cost} title="비용">
          {spec.cost}
        </span>
      </span>
      <span className={styles.kind}>{kindLabel(spec.kind)}{spec.special ? ' · 특수' : ''}</span>
      <span className={styles.stats}>
        <span>시야 {spec.sight}</span>
        <span>점수 {spec.score}</span>
      </span>
      <span className={styles.substats}>
        {spec.hp > 0 && <span>체력 {spec.hp}</span>}
        {spec.attack > 0 && <span>공격 {spec.attack}</span>}
        {spec.range > 0 && <span>사거리 {spec.range}</span>}
        {spec.production > 0 && <span>생산 {spec.production}</span>}
        {spec.keywords.map((k) => (
          <span key={k}>{keywordLabel(k)}</span>
        ))}
        {spec.effect && <span>{effectLabel(spec)}</span>}
      </span>
      {reason && <span className={styles.reason}>{reason}</span>}
      {hoverDetails && (
        <span className={styles.popover} role="tooltip">
          <span className={styles.popoverTitle}>{spec.name}</span>
          <span className={styles.popoverDesc}>{spec.description}</span>
          <SpecRows spec={spec} />
        </span>
      )}
    </button>
  );
});
