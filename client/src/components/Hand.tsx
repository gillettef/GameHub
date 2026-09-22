import { memo } from 'react';
import { getSpec } from '@astraltab/shared';
import type { HandCardView } from '../game/derived';
import { CardFace } from './CardFace';
import styles from './Hand.module.css';

interface HandProps {
  cards: HandCardView[];
  selectedIndex: number | null;
  /** 내 턴이 아니면 어떤 카드도 고를 수 없다 (F009) */
  interactive: boolean;
  onSelect: (index: number | null) => void;
}

/** 보드 탭 하단 손패 (F009, F011). 낼 수 없는 카드는 음영 + 이유 */
export const Hand = memo(function Hand({ cards, selectedIndex, interactive, onSelect }: HandProps) {
  if (cards.length === 0) {
    return <p className={styles.empty}>손패가 비었습니다. 패스로 턴을 넘기세요.</p>;
  }
  return (
    <ul className={styles.list} aria-label="손패">
      {cards.map((c) => {
        const selectable = interactive && c.playable;
        return (
          <li key={`${c.index}-${c.cardId}`}>
            <CardFace
              spec={getSpec(c.cardId)}
              selected={selectedIndex === c.index}
              disabled={!selectable}
              reason={interactive ? c.reason : null}
              onClick={selectable ? () => onSelect(selectedIndex === c.index ? null : c.index) : undefined}
            />
          </li>
        );
      })}
    </ul>
  );
});
