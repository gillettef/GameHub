import { memo } from 'react';
import type { CardSpec } from '@astraltab/shared';
import { getSpec } from '@astraltab/shared';
import type { MarkerView } from '../game/derived';
import { effectExplain, keywordExplain, kindLabel } from '../game/derived';
import { TERRAIN_LEGEND } from '../tabs/HelpTab';
import { effectLabel } from './CardFace';
import styles from './InfoPanel.module.css';

interface InfoPanelProps {
  title: string;
  meta?: string;
  /** 스탯 한 줄 ("체력 3/6 · 공격 2 …") */
  stats?: string;
  spec: CardSpec;
  terrain?: string;
  onClose?: () => void;
}

/**
 * 카드·마커 설명 패널. 모바일에는 호버가 없어 손패 팝오버와 마커 툴팁을 못 보므로,
 * 카드를 고르거나 보드의 마커를 탭하면 같은 내용을 이 패널로 보여 준다(설명·키워드 뜻·마법 효과 범위·지형).
 */
const InfoPanel = memo(function InfoPanel({ title, meta, stats, spec, terrain, onClose }: InfoPanelProps) {
  const effect = effectLabel(spec);
  const explain = effectExplain(spec);
  const terrainInfo = terrain ? TERRAIN_LEGEND.find((t) => t.terrain === terrain) : null;
  return (
    <div className={styles.root} role="region" aria-label={`${title} 설명`}>
      <div className={styles.head}>
        <strong className={styles.title}>{title}</strong>
        {meta && <span className={styles.meta}>{meta}</span>}
        {onClose && (
          <button type="button" className={styles.close} onClick={onClose} aria-label="설명 닫기">
            ×
          </button>
        )}
      </div>
      {stats && <p className={styles.stats}>{stats}</p>}
      <p className={styles.text}>{spec.description}</p>
      {effect && explain && (
        <p className={styles.text}>
          <b>{effect}</b> — {explain}
        </p>
      )}
      {spec.keywords.map((k) => (
        <p key={k} className={styles.text}>
          {keywordExplain(k)}
        </p>
      ))}
      {terrainInfo && terrainInfo.terrain !== 'asteroid' && (
        <p className={styles.text}>
          <b>{terrainInfo.label}</b> — {terrainInfo.desc}
        </p>
      )}
    </div>
  );
});

/** 손패에서 고른 카드의 설명 */
export const CardInfo = memo(function CardInfo({ cardId }: { cardId: string }) {
  const spec = getSpec(cardId);
  const bits = [`비용 ${spec.cost}`, `시야 ${spec.sight}`];
  if (spec.hp > 0) bits.push(`체력 ${spec.hp}`);
  if (spec.attack > 0) bits.push(`공격 ${spec.attack}`);
  if (spec.range > 0) bits.push(`사거리 ${spec.range}`);
  if (spec.production > 0) bits.push(`생산 +${spec.production}`);
  bits.push(`점수 ${spec.score}`);
  return <InfoPanel title={spec.name} meta={kindLabel(spec.kind)} stats={bits.join(' · ')} spec={spec} />;
});

/** 보드에서 탭한 마커의 설명 (지형 보정이 반영된 실제 수치) */
export const MarkerInfo = memo(function MarkerInfo({ marker, terrain, onClose }: { marker: MarkerView; terrain: string; onClose: () => void }) {
  const spec = getSpec(marker.specId);
  const bits = [`체력 ${marker.hp}/${marker.maxHp}`];
  if (marker.attack > 0) bits.push(`공격 ${marker.attack}`);
  if (marker.range > 0) bits.push(`사거리 ${marker.range}`);
  bits.push(`시야 ${marker.sight}`, `점수 ${marker.score}`);
  if (marker.production > 0) bits.push(`생산 +${marker.production}`);
  if (marker.remainingTurns !== null) bits.push(`남은 턴 ${marker.remainingTurns}`);
  return (
    <InfoPanel
      title={marker.name}
      meta={`${kindLabel(marker.kind)} · ${marker.ownerName} (좌석 ${marker.seat + 1})`}
      stats={bits.join(' · ')}
      spec={spec}
      terrain={terrain}
      onClose={onClose}
    />
  );
});
