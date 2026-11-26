import { memo } from 'react';
import { SPOT_BACK_URL } from '../game/cardImages';
import { cx } from '../lib/cx';
import { selectCanTake, selectState, useGameStore } from '../store/gameStore';
import { SpeciesCard } from './SpeciesCard';
import styles from './Market.module.css';

/**
 * 펼친 타일 줄 (규칙 용어 마켓, Rules.md 5절): 펼쳐 둔 명당 타일 2개(공개)와 주머니(카드 더미)에 남은 개수.
 * 타일은 손과 같은 작은 육각 타일이다.
 * 내 가져오기 차례에는 타일을 누르면 크게 보고 "이 타일 가져오기"로 가져온다(GameModal 'market').
 * 같은 차례에 맨 끝의 주머니를 누르면 "주머니에서 1개 꺼내기"(GameModal 'pile')로 뒷면만 보고 가져온다.
 * 그 밖에는 크게 보기만 된다. 개수·순서는 가정하지 않는다 — state.market 을 그대로 그린다.
 * 생선 냄새(v7, Rules.md 5.3): 주머니 맨 위를 펼친 타일(state.peek)을 세 번째로 보여 주고, 그 차례에는 주머니 뒷면 대신 이 타일을 가져올 수 있다.
 */
export const Market = memo(function Market() {
  const market = useGameStore((s) => s.state?.market);
  const pileCount = useGameStore((s) => s.state?.pileCount ?? 0);
  const canTake = useGameStore(selectCanTake);
  const openCardModal = useGameStore((s) => s.openCardModal);
  const phase = useGameStore((s) => selectState(s)?.phase);
  const peek = useGameStore((s) => s.state?.peek ?? null);
  if (!market || phase !== 'playing') return null;

  return (
    <div className={cx(styles.row, canTake && styles.rowActive)} role="group" aria-label={canTake ? '펼친 타일: 가져올 타일을 누르세요' : '펼친 타일'}>
      <span className={styles.meta}>
        <span className={styles.label}>펼친 타일</span>
        <span className={styles.pile} title="주머니에 남은 타일" aria-label={`주머니 ${pileCount}개`}>
          <img className={styles.back} src={SPOT_BACK_URL} alt="" />
          주머니 {pileCount}
        </span>
      </span>
      {market.length === 0 && !peek ? (
        <span className={styles.empty}>펼친 타일 없음 · 내 타일만 씁니다</span>
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
          {peek && (
            <div role="listitem" className={styles.slot}>
              <div className={styles.peek}>
                <SpeciesCard species={peek} variant="mini" compact onClick={() => openCardModal(canTake ? { kind: 'peek' } : { kind: 'species', species: peek })} />
                <span className={styles.peekTag}>생선 냄새</span>
              </div>
            </div>
          )}
          {canTake && !peek && pileCount > 0 && (
            <div role="listitem" className={styles.slot}>
              <button type="button" className={styles.pileCard} onClick={() => openCardModal({ kind: 'pile' })} aria-label={`주머니에서 뒷면으로 1개 꺼내기 (남은 ${pileCount}개)`}>
                <img className={styles.pileBack} src={SPOT_BACK_URL} alt="" />
                <span className={styles.pileName}>주머니</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
