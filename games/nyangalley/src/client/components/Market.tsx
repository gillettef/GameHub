import { memo } from 'react';
import { SPOT_BACK_URL } from '../game/cardImages';
import { cx } from '../lib/cx';
import { selectActOptions, selectCanTake, selectChoosingAct, selectState, useGameStore } from '../store/gameStore';
import { SpeciesCard } from './SpeciesCard';
import styles from './Market.module.css';

/**
 * 펼친 타일 줄 (규칙 용어 마켓, Rules.md 5절): 펼쳐 둔 명당 타일 2개(공개)와 주머니(카드 더미)에 남은 개수.
 * 타일은 손과 같은 작은 육각 타일이다.
 * 가져오기는 펼친 타일 1개, 또는 주머니에서 2개다(Rules.md 5.1 1). 가져오기를 고르면 타일을 누르면 크게 보고 "이 타일 가져오기"
 * (GameModal 'market', 그것으로 차례 끝), 맨 끝의 주머니를 누르면 "주머니에서 꺼내기"(GameModal 'pile')로 뒷면만 보고 가져온다.
 * 주머니 두 번째 장 단계에는 주머니만 누를 수 있다.
 * 그 밖에는 크게 보기만 된다. 개수·순서는 가정하지 않는다 — state.market 을 그대로 그린다.
 */
export const Market = memo(function Market() {
  const market = useGameStore((s) => s.state?.market);
  const pileCount = useGameStore((s) => s.state?.pileCount ?? 0);
  // 가져오기를 고른 뒤(또는 두 번째 타일)에 가져온다. 행동을 고르기 전에 눌러도 가져오기 창이 열린다(지름길)
  const canTake = useGameStore((s) => selectCanTake(s) || (selectChoosingAct(s) && !!selectActOptions(s)?.take));
  const second = useGameStore((s) => s.state?.stage === 'take');
  const openCardModal = useGameStore((s) => s.openCardModal);
  const phase = useGameStore((s) => selectState(s)?.phase);
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
      {market.length === 0 && !(canTake && pileCount > 0) ? (
        <span className={styles.empty}>펼친 타일 없음</span>
      ) : (
        <div className={styles.cards} role="list">
          {market.map((species, i) => (
            <div role="listitem" key={`${i}-${species}`} className={styles.slot}>
              <SpeciesCard
                species={species}
                variant="mini"
                compact
                dimmed={canTake && second}
                onClick={() => openCardModal(canTake && !second ? { kind: 'market', index: i } : { kind: 'species', species })}
              />
            </div>
          ))}
          {canTake && pileCount > 0 && (
            <div role="listitem" className={styles.slot}>
              <button type="button" className={styles.pileCard} onClick={() => openCardModal({ kind: 'pile' })} aria-label={`주머니에서 뒷면으로 꺼내기 (남은 ${pileCount}개)`}>
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
