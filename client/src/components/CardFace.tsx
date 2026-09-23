import { memo, type ReactNode } from 'react';
import type { CardSpec } from '@astraltab/shared';
import { keywordExplain, keywordLabel, kindLabel } from '../game/derived';
import { cx } from '../lib/cx';
import styles from './CardFace.module.css';

/** 스탯 아이콘. 선 굵기·스타일을 TabDock 아이콘과 맞춘다(고정폭 선, currentColor).
 * 설명 탭(HelpTab)이 같은 아이콘을 그대로 재사용하도록 내보낸다 */
export const ICONS = {
  cost: (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true">
      <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
    </svg>
  ),
  sight: (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  score: (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true">
      <path d="M12 2 15 9.5 23 10.3 17 15.6 18.6 23 12 19.1 5.4 23 7 15.6 1 10.3 9 9.5Z" />
    </svg>
  ),
  hp: (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true">
      <path d="M12 21S3 14.6 3 8.6C3 5.5 5.4 3 8.4 3c1.7 0 3.2.8 4.1 2.1C13.4 3.8 14.9 3 16.6 3 19.6 3 22 5.5 22 8.6 22 14.6 12 21 12 21Z" />
    </svg>
  ),
  attack: (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M4 20 15 9M13 4l7 7-3 3-7-7 3-3ZM4 20l2-6 4 4-6 2Z" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  ),
  range: (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
    </svg>
  ),
  production: (
    <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M4 20V13M11 20V8M18 20v-9M3 8l8-5 10 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
} satisfies Record<string, ReactNode>;

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

/** 아이콘 + 값 한 쌍. 카드 앞면 스탯 줄과 팝오버 스펙 표에서 함께 쓴다 */
function Stat({ icon, value, title }: { icon: ReactNode; value: string; title: string }) {
  return (
    <span className={styles.stat} title={title}>
      <span className={styles.statIcon}>{icon}</span>
      {value}
    </span>
  );
}

/** 카드 상세 스펙 표 (F011, F017). 0인 항목은 생략한다 */
export const SpecRows = memo(function SpecRows({ spec }: { spec: CardSpec }) {
  const rows: [ReactNode, string][] = [];
  rows.push([ICONS.cost, `비용 ${spec.cost}`]);
  rows.push([ICONS.sight, `시야 ${spec.sight}`]);
  rows.push([ICONS.score, `점수 ${spec.score}`]);
  if (spec.hp > 0) rows.push([ICONS.hp, `체력 ${spec.hp}`]);
  if (spec.attack > 0) rows.push([ICONS.attack, `공격 ${spec.attack}`]);
  if (spec.range > 0) rows.push([ICONS.range, `사거리 ${spec.range}`]);
  if (spec.production > 0 && spec.kind !== 'core') rows.push([ICONS.production, `생산 ${spec.production}`]);
  const effect = effectLabel(spec);
  return (
    <dl className={styles.rows}>
      {rows.map(([icon, text], i) => (
        <div key={i} className={styles.row}>
          <dt className={styles.rowIcon}>{icon}</dt>
          <dd>{text}</dd>
        </div>
      ))}
      {effect && (
        <div className={styles.row}>
          <dt className={styles.rowIcon} aria-hidden="true" />
          <dd>{effect}</dd>
        </div>
      )}
      {spec.keywords.length > 0 && (
        <div className={styles.row}>
          <dt className={styles.rowIcon} aria-hidden="true" />
          <dd>{spec.keywords.map(keywordLabel).join(', ')}</dd>
        </div>
      )}
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
  /** 소유자 좌석. 있으면 배경을 좌석 색으로 물들인다 (덱 빌딩처럼 좌석이 아직 없는 화면은 생략) */
  seat?: number;
}

/**
 * 손패·덱 빌딩 공용 카드. 비용·시야·점수는 항상 보이고(F011, F017).
 * 배경은 소유자 좌석 색, 종류(건물·유닛·마법)는 카드 이름 텍스트 색 + 이름 앞 모양 배지로 구분한다
 * (보드 마커의 모양 언어: 건물=둥근 사각·유닛=원·마법=마름모 — Board.module.css 와 맞춘다).
 */
export const CardFace = memo(function CardFace({ spec, selected, disabled, reason, onClick, hoverDetails, seat }: CardFaceProps) {
  const effect = effectLabel(spec);
  return (
    <button
      type="button"
      className={cx(styles.card, selected && styles.selected, disabled && styles.disabled)}
      data-kind={spec.kind}
      data-seat={seat ?? undefined}
      aria-pressed={selected ?? false}
      disabled={disabled && !onClick}
      onClick={onClick}
    >
      <span className={styles.head}>
        <span className={styles.name}>
          <span className={styles.kindGlyph} aria-hidden="true" />
          {spec.name}
        </span>
        <span className={styles.cost} title="비용">
          <span className={styles.costIcon}>{ICONS.cost}</span>
          {spec.cost}
        </span>
      </span>
      <span className={styles.kind}>{kindLabel(spec.kind)}{spec.special ? ' · 특수' : ''}</span>
      <span className={styles.stats}>
        <Stat icon={ICONS.sight} value={String(spec.sight)} title="시야" />
        <Stat icon={ICONS.score} value={String(spec.score)} title="점수" />
      </span>
      <span className={styles.substats}>
        {spec.hp > 0 && <Stat icon={ICONS.hp} value={String(spec.hp)} title="체력" />}
        {spec.attack > 0 && <Stat icon={ICONS.attack} value={String(spec.attack)} title="공격" />}
        {spec.range > 0 && <Stat icon={ICONS.range} value={String(spec.range)} title="사거리" />}
        {spec.production > 0 && <Stat icon={ICONS.production} value={`+${spec.production}`} title="생산" />}
        {spec.keywords.map((k) => (
          <span key={k} className={styles.keywordTag} title={keywordExplain(k)}>
            {keywordLabel(k)}
          </span>
        ))}
        {effect && <span className={styles.effectTag}>{effect}</span>}
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
