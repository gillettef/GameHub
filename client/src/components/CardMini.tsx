import { memo, type ReactNode } from 'react';
import type { CardSpec } from '@astraltab/shared';
import { CardArt } from '../game/cardArt';
import { cardImageUrl } from '../game/cardImage';
import { cx } from '../lib/cx';
import { ICONS } from './CardFace';
import { CheckIcon, LockIcon } from './icons';
import styles from './CardMini.module.css';

interface CardMiniProps {
  spec: CardSpec;
  selected?: boolean;
  /** 지금은 낼 수 없는 카드: 흐리게 + 자물쇠. 이유는 확대 모달에서 읽는다 */
  locked?: boolean;
  /** 손패 교체 모드에서 버릴 카드로 골라진 상태 */
  picked?: boolean;
  seat?: number;
  /** 새로 뽑아 들어온 카드: 한 번 미끄러져 들어온다 */
  fresh?: boolean;
  onClick?: () => void;
}

/** 카드 아래쪽에 보여 줄 핵심 스탯 아이콘 최대 3개 */
function statChips(spec: CardSpec): { key: string; icon: ReactNode; value: string }[] {
  const list: { key: string; icon: ReactNode; value: string }[] = [];
  if (spec.attack > 0) list.push({ key: 'attack', icon: ICONS.attack, value: String(spec.attack) });
  if (spec.hp > 0) list.push({ key: 'hp', icon: ICONS.hp, value: String(spec.hp) });
  if (spec.production > 0) list.push({ key: 'production', icon: ICONS.production, value: `+${spec.production}` });
  if (list.length === 0 && spec.sight > 0) list.push({ key: 'sight', icon: ICONS.sight, value: String(spec.sight) });
  return list.slice(0, 3);
}

/**
 * 손패용 작은 카드 (2026-10-01 사용자 지시: 모바일에서는 카드도 아이콘 위주로, 자세한 내용은 탭하면 모달로 확대).
 * 일러스트 + 비용 + 종류 아이콘 + 핵심 스탯만 보여 준다. 이름·설명·키워드는 CardModal 에서 읽는다.
 * 종류는 아이콘 색(건물 Amber, 마법 Violet, 유닛 흰색)으로 구분하는 기존 언어를 그대로 쓴다.
 */
export const CardMini = memo(function CardMini({ spec, selected, locked, picked, seat, fresh, onClick }: CardMiniProps) {
  const image = cardImageUrl(spec.id);
  return (
    <button
      type="button"
      className={cx(styles.card, selected && styles.selected, locked && styles.locked, picked && styles.picked, fresh && styles.fresh)}
      data-kind={spec.kind}
      data-seat={seat ?? undefined}
      aria-pressed={selected ?? false}
      aria-label={`${spec.name}, 비용 ${spec.cost}${locked ? ', 지금은 낼 수 없음' : ''}`}
      onClick={onClick}
    >
      <span className={styles.art}>
        {image ? <img src={image} alt="" loading="lazy" draggable={false} /> : <CardArt cardId={spec.id} className={styles.glyph} />}
      </span>
      <span className={styles.cost}>
        <span className={styles.costIcon}>{ICONS.cost}</span>
        {spec.cost}
      </span>
      <span className={styles.kind} title={spec.name}>
        <CardArt cardId={spec.id} className={styles.kindIcon} />
      </span>
      <span className={styles.stats}>
        {statChips(spec).map((c) => (
          <span key={c.key} className={styles.stat}>
            <span className={styles.statIcon}>{c.icon}</span>
            {c.value}
          </span>
        ))}
      </span>
      {locked && (
        <span className={styles.lock} aria-hidden="true">
          <LockIcon size={14} />
        </span>
      )}
      {picked && (
        <span className={styles.pickMark} aria-hidden="true">
          <CheckIcon size={22} />
        </span>
      )}
    </button>
  );
});
