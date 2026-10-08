import { memo } from 'react';
import { PLANT_BACK_URL } from '../game/cardImages';
import { selectIsMyTurn, selectState, selectTake, useGameStore } from '../store/gameStore';
import { SpeciesCard } from './SpeciesCard';
import styles from './Market.module.css';

/**
 * 마켓 줄 (Rules.md 5절): 이번 라운드에 펼친 카드(공개)와 카드 더미 장수.
 * 내 차례에는 눌러서 가져올 카드를 고르고(고른 카드를 한 번 더 누르면 크게 보기), 남의 차례에는 크게 보기만 된다.
 * 장수·순서는 가정하지 않는다 — state.market 을 그대로 그린다.
 */
export const Market = memo(function Market() {
  const market = useGameStore((s) => s.state?.market);
  const pileCount = useGameStore((s) => s.state?.pileCount ?? 0);
  const isMyTurn = useGameStore(selectIsMyTurn);
  const take = useGameStore(selectTake);
  const pickTake = useGameStore((s) => s.pickTake);
  const openCardModal = useGameStore((s) => s.openCardModal);
  const phase = useGameStore((s) => selectState(s)?.phase);
  if (!market || phase !== 'playing') return null;

  return (
    <div className={styles.row} role="group" aria-label="마켓">
      <span className={styles.meta}>
        <span className={styles.label}>마켓</span>
        <span className={styles.pile} title="카드 더미에 남은 카드" aria-label={`카드 더미 ${pileCount}장`}>
          <img className={styles.back} src={PLANT_BACK_URL} alt="" />
          더미 {pileCount}장
        </span>
      </span>
      {market.length === 0 ? (
        <span className={styles.empty}>마켓 없음 · 내 카드만 씁니다</span>
      ) : (
        <div className={styles.cards} role="list">
          {market.map((species, i) => (
            <div role="listitem" key={`${i}-${species}`} className={styles.slot}>
              <SpeciesCard
                species={species}
                variant="chip"
                selected={isMyTurn && take === i}
                onClick={() => {
                  if (isMyTurn && take !== i) pickTake(i);
                  else openCardModal({ kind: 'species', species });
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
