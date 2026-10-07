import { memo } from 'react';
import { selectIsMyTurn, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { SpeciesCard } from './SpeciesCard';
import styles from './Hand.module.css';

/**
 * 내 손패 (최대 3장). 카드를 누르면 확대 모달에서 고른다. 상대 차례에도 보기는 된다.
 * plantable: 손패 카드별 심을 칸 수 (BoardTab 이 계산). 0 이면 음영
 */
export const Hand = memo(function Hand({ plantable = [] }: { plantable?: number[] }) {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const selected = useGameStore((s) => s.selectedHandIndex);
  const isMyTurn = useGameStore(selectIsMyTurn);
  const openCardModal = useGameStore((s) => s.openCardModal);
  const me = state?.players.find((p) => p.id === viewerId);
  if (!me) return null;
  return (
    <div className={styles.row} role="list" aria-label="손패">
      {me.hand.map((species, index) => (
        <div role="listitem" key={`${index}-${species}`} className={styles.slot}>
          <SpeciesCard
            species={species}
            variant="mini"
            compact
            seat={me.seat}
            selected={selected === index}
            dimmed={!isMyTurn || plantable[index] === 0}
            onClick={() => openCardModal({ kind: 'hand', index })}
          />
        </div>
      ))}
      {me.hand.length === 0 && <p className={styles.empty}>손패를 모두 썼습니다</p>}
      <span className={styles.deck} title="남은 덱">
        덱 {me.deckCount}
      </span>
    </div>
  );
});
