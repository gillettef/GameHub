import { memo, type CSSProperties } from 'react';
import type { SpeciesId } from '../../engine';
import { getSpecies } from '../../engine';
import { spotTileUrl } from '../game/cardImages';
import { cx } from '../lib/cx';
import styles from './SpeciesCard.module.css';

interface SpeciesCardProps {
  species: SpeciesId;
  /** mini: 손·펼친 타일·카드 탭의 작은 타일 / full: 확대 모달 / chip: 공개 단계의 내 첫 타일처럼 가로 한 줄 */
  variant: 'mini' | 'full' | 'chip';
  /** 주인 자리 색으로 테두리를 물들인다 */
  seat?: number | null;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  /** 손·펼친 타일용 납작한 타일: 능력 줄을 빼고(확대 모달에서 본다) 그림을 줄여 보드 높이를 남긴다 */
  compact?: boolean;
}

/** 능력 한 줄 요약 (Rules.md 7절 "능력" 열, 화면 테마 「냥냥 골목」). 고양이 모양만 있는 명당은 null */
function specialText(species: SpeciesId): string | null {
  const sp = getSpecies(species);
  if (sp.seed) return `멀리 +${sp.seed}: 두 칸 안 아무 칸에 ${sp.seed}마리`;
  if (sp.pondPlanting) return '개울 옆이면 어디든';
  if (sp.wither) return `옆 6칸 남의 고양이 −${sp.wither}`;
  if (sp.bloomBonus) return `끝날 때 내 영역이면 +${sp.bloomBonus}점`;
  return null;
}

/**
 * 명당 타일 (규칙 용어 식물 카드). 그림은 꼭짓점이 위인 육각 타일(public/art/spot-<종 id>.svg)이고,
 * 타일 안에 가운데·옆 칸마다 모이는 고양이 수 배지가 그려져 있어 작게 줄여도 모양이 읽힌다.
 *  - mini·chip: 타일 그림 + 이름(글자). 타일 안 이름 글씨는 작아서 못 읽으니 아래(chip 은 오른쪽)에 다시 쓴다.
 *  - full(확대 모달): 큰 타일 + 이름·설명·능력 문구.
 */
export const SpeciesCard = memo(function SpeciesCard({ species, variant, seat, selected, dimmed, onClick, compact }: SpeciesCardProps) {
  const sp = getSpecies(species);
  const special = specialText(species);
  const Tag = onClick ? 'button' : 'div';
  const label = `${sp.name}: ${sp.description}${special ? ` (${special})` : ''}`;
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={cx(styles.card, styles[variant], compact && styles.compact, selected && styles.selected, dimmed && styles.dimmed)}
      style={seat !== undefined && seat !== null ? ({ '--seat-color': `var(--color-seat-${seat})` } as CSSProperties) : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!selected : undefined}
      aria-label={onClick ? label : undefined}
    >
      {variant === 'full' ? (
        <>
          <img className={styles.face} src={spotTileUrl(species)} alt={`명당 타일 ${label}`} decoding="async" />
          <span className={styles.fullName}>{sp.name}</span>
          <span className={styles.desc}>{sp.description}</span>
          {special && <span className={styles.special}>{special}</span>}
        </>
      ) : (
        <>
          <img className={styles.tile} src={spotTileUrl(species)} alt="" aria-hidden="true" decoding="async" draggable={false} />
          <span className={styles.name}>{sp.name}</span>
          {variant === 'mini' && special && !compact && <span className={styles.specialMini}>{special}</span>}
        </>
      )}
    </Tag>
  );
});
