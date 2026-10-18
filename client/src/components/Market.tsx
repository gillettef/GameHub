import { memo } from 'react';
import { PLANT_BACK_URL } from '../game/cardImages';
import { cx } from '../lib/cx';
import { selectCanTake, selectState, useGameStore } from '../store/gameStore';
import { SpeciesCard } from './SpeciesCard';
import styles from './Market.module.css';

/**
 * 마켓 줄 (Rules.md 5절): 펼친 카드 2장(공개)과 카드 더미 장수. 카드는 손패와 같은 미니 카드다.
 * 내 가져오기 차례에는 카드를 누르면 크게 보고 "이 카드 가져오기"로 가져온다(GameModal 'market').
 * 같은 차례에 맨 끝의 카드 더미 뒷면을 누르면 "더미에서 1장 가져오기"(GameModal 'pile')로 뒷면만 보고 가져온다.
 * 그 밖에는 크게 보기만 된다. 장수·순서는 가정하지 않는다 — state.market 을 그대로 그린다.
 */
export const Market = memo(function Market() {
  const market = useGameStore((s) => s.state?.market);
  const pileCount = useGameStore((s) => s.state?.pileCount ?? 0);
  const canTake = useGameStore(selectCanTake);
  const openCardModal = useGameStore((s) => s.openCardModal);
  const phase = useGameStore((s) => selectState(s)?.phase);
  if (!market || phase !== 'playing') return null;

  return (
    <div className={cx(styles.row, canTake && styles.rowActive)} role="group" aria-label={canTake ? '마켓: 가져올 카드를 누르세요' : '마켓'}>
      <span className={styles.meta}>
        <span className={styles.label}>마켓</span>
        <span className={styles.pile} title="카드 더미에 남은 카드" aria-label={`카드 더미 ${pileCount}장`}>
          <img className={styles.back} src={PLANT_BACK_URL} alt="" />
          더미 {pileCount}장
        </span>
      </span>
      {market.length === 0 ? (
        <span className={styles.empty}>{pileCount === 0 ? '마켓 없음 · 내 카드만 씁니다' : '모두 가져갔습니다 · 다음 라운드에 새로 펼칩니다'}</span>
      ) : (
        <div className={styles.cards} role="list">
          {market.map((species, i) => (
            <div role="listitem" key={`${i}-${species}`} className={styles.slot}>
              <SpeciesCard
                species={species}
                variant="mini"
                compact
                onClick={() => openCardModal(canTake ? { kind: 'market', index: i } : { kind: 'species', species })}
              />
            </div>
          ))}
          {canTake && pileCount > 0 && (
            <div role="listitem" className={styles.slot}>
              <button type="button" className={styles.pileCard} onClick={() => openCardModal({ kind: 'pile' })} aria-label={`카드 더미에서 뒷면으로 1장 가져오기 (남은 ${pileCount}장)`}>
                <img className={styles.pileBack} src={PLANT_BACK_URL} alt="" />
                <span className={styles.pileName}>더미에서</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
