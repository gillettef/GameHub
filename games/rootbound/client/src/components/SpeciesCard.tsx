import { memo, type CSSProperties } from 'react';
import type { SpeciesId } from '@rootbound/shared';
import { getSpecies } from '@rootbound/shared';
import { plantArtUrl, plantCardUrl } from '../game/cardImages';
import { cx } from '../lib/cx';
import { RootDiagram } from './RootDiagram';
import styles from './SpeciesCard.module.css';

interface SpeciesCardProps {
  species: SpeciesId;
  /** chip: 공개 단계의 내 카드처럼 가로 한 줄로 쓰는 작은 카드(뿌리 모양 + 이름) */
  variant: 'mini' | 'full' | 'chip';
  /** 주인 자리 색으로 테두리를 물들인다 */
  seat?: number | null;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  /** 손패용 납작한 미니 카드: 특수 효과 줄을 빼고(확대 모달에서 본다) 그림을 줄여 보드 높이를 남긴다 */
  compact?: boolean;
}

/** 능력 한 줄 요약 (Rules.md 7절 "능력" 열). 뿌리 모양만 있는 식물은 null */
function specialText(species: SpeciesId): string | null {
  const sp = getSpecies(species);
  if (sp.seed) return `두 칸 안 아무 칸에 큐브 ${sp.seed}`;
  if (sp.pondPlanting) return '연못 옆 빈 칸이면 어디든 심기';
  if (sp.wither) return `맞닿은 6칸의 남의 큐브 −${sp.wither}`;
  if (sp.bloomBonus) return `끝날 때 내 땅 위면 +${sp.bloomBonus}점`;
  return null;
}

/**
 * 식물 카드.
 *  - full(확대 모달): 카드 디자인 앞면(public/cards/plants) 을 그대로 보여 준다. 이름·뿌리 모양·문구가 그림 안에 있다.
 *  - mini·chip(손패·마켓·카드 탭·공개 단계): 작아서 카드 글자를 읽을 수 없으니 카드 그림 썸네일(plants/art)을 배경으로 깔고
 *    이름·뿌리 모양 다이어그램을 그 위에 그린다.
 */
export const SpeciesCard = memo(function SpeciesCard({ species, variant, seat, selected, dimmed, onClick, compact }: SpeciesCardProps) {
  const sp = getSpecies(species);
  const special = specialText(species);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={cx(styles.card, styles[variant], compact && styles.compact, selected && styles.selected, dimmed && styles.dimmed)}
      style={seat !== undefined && seat !== null ? ({ '--seat-color': `var(--color-seat-${seat})` } as CSSProperties) : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!selected : undefined}
      aria-label={onClick ? `${sp.name}: ${sp.description}` : undefined}
    >
      {variant === 'full' ? (
        <img className={styles.face} src={plantCardUrl(species)} alt={`${sp.name} 카드. ${sp.description}${special ? ` ${special}.` : ''}`} decoding="async" />
      ) : (
        <>
          <span className={styles.art} style={{ backgroundImage: `url(${plantArtUrl(species)})` }} aria-hidden="true" />
          <span className={styles.name}>{sp.name}</span>
          <span className={styles.diagram}>
            <RootDiagram species={species} size={variant === 'chip' ? 26 : compact ? 44 : 58} />
          </span>
          {variant === 'mini' && special && !compact && <span className={styles.specialMini}>{special}</span>}
        </>
      )}
    </Tag>
  );
});
