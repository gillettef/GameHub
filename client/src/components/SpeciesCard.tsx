import { memo, type CSSProperties } from 'react';
import type { SpeciesId } from '@rootbound/shared';
import { getSpecies } from '@rootbound/shared';
import { plantArtUrl, plantCardUrl } from '../game/cardImages';
import { cx } from '../lib/cx';
import { RootDiagram } from './RootDiagram';
import styles from './SpeciesCard.module.css';

interface SpeciesCardProps {
  species: SpeciesId;
  /** chip: 마켓용 가로 한 줄 카드(뿌리 모양 + 이름) */
  variant: 'mini' | 'full' | 'chip';
  /** 주인 좌석 색으로 테두리를 물들인다 */
  seat?: number | null;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  /** 카드 아래 덧붙일 표시 */
  footer?: React.ReactNode;
  /** 손패용 납작한 미니 카드: 특수 효과 줄을 빼고(확대 모달에서 본다) 그림을 줄여 보드 높이를 남긴다 */
  compact?: boolean;
}

/** 특수 효과 한 줄 요약 (Rules.md 7절 "특수" 열) */
export function specialText(species: SpeciesId): string | null {
  const sp = getSpecies(species);
  if (sp.line) return `한 방향 직선 ${sp.lineLength}칸에 ${sp.line}`;
  if (sp.star2) return `한 칸 건너뛴 6칸에 ${sp.star2}`;
  if (sp.seed) return `두 칸 안 빈 칸에 씨앗(${sp.seed})`;
  if (sp.fertileRing) return `기름진 땅이면 맞닿은 칸에 ${sp.ring1 + sp.fertileRing}씩`;
  if (sp.pondPlanting) return '연못 옆이면 뿌리 없이도 심기';
  if (sp.ivy) return `옆 칸 중 식물 칸에 +${sp.ivy}`;
  if (sp.cluster) return `맞닿은 내 대나무마다 심은 칸 +${sp.cluster}`;
  if (sp.wither) return `맞닿은 6칸의 다른 사람 영향력 −${sp.wither}`;
  if (sp.bloomBonus) return `끝날 때 이 칸이 내 땅이면 +${sp.bloomBonus}점`;
  return null;
}

/**
 * 식물 카드.
 *  - full(확대 모달): 카드 디자인 앞면(public/cards/plants) 을 그대로 보여 준다. 이름·뿌리 모양·문구가 그림 안에 있다.
 *  - mini·chip(손패·마켓·카드 탭): 작아서 카드 글자를 읽을 수 없으니 카드 그림 썸네일(plants/art)을 배경으로 깔고
 *    이름·뿌리 모양 다이어그램을 그 위에 그린다.
 */
export const SpeciesCard = memo(function SpeciesCard({ species, variant, seat, selected, dimmed, onClick, footer, compact }: SpeciesCardProps) {
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
      {footer}
    </Tag>
  );
});
