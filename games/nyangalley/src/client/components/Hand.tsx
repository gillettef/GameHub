import { memo } from 'react';
import { findMe, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { SpeciesCard } from './SpeciesCard';
import styles from './Hand.module.css';

/**
 * 내 타일(손에 든 명당 타일). 타일을 누르면 확대 모달에서 고른다. 상대 차례·가져오기 차례에도 보기는 된다.
 * plantable: 손의 타일별 놓을 칸 수 (BoardTab 이 계산). 0 이면 음영. canPlant: 내 놓기 차례 (아니면 모두 음영)
 */
export const Hand = memo(function Hand({ plantable = [], canPlant = false }: { plantable?: number[]; canPlant?: boolean }) {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const selected = useGameStore((s) => s.selectedHandIndex);
  const openCardModal = useGameStore((s) => s.openCardModal);
  const me = findMe(state, viewerId);
  if (!me) return null;
  return (
    <div className={styles.row} role="list" aria-label="내 타일">
      {me.hand.map((species, index) => (
        <div role="listitem" key={`${index}-${species}`} className={styles.slot}>
          <SpeciesCard
            species={species}
            variant="mini"
            compact
            seat={me.seat}
            selected={selected === index}
            dimmed={!canPlant || plantable[index] === 0}
            onClick={() => openCardModal({ kind: 'hand', index })}
          />
        </div>
      ))}
      {me.hand.length === 0 && <p className={styles.empty}>타일을 모두 놓았습니다</p>}
    </div>
  );
});
