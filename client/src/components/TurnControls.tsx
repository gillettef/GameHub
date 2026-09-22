import { memo, useState } from 'react';
import { countPasses, nameOf } from '@astraltab/shared';
import { cx } from '../lib/cx';
import { selectIsMyTurn, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import styles from './TurnControls.module.css';

interface TurnControlsProps {
  /** 좁은 자리(보드 탭 하단)용 가로 배치 */
  compact?: boolean;
}

/**
 * 패스·기권 (F013). 배치는 자동으로 턴을 끝내므로 '턴 종료' 버튼은 없다.
 * 기권은 확인 단계를 거친다. 내 턴이 아니면 비활성 + 누구의 턴인지 표시.
 */
export const TurnControls = memo(function TurnControls({ compact }: TurnControlsProps) {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const isMyTurn = useGameStore(selectIsMyTurn);
  const dispatch = useGameStore((s) => s.dispatch);
  const [confirming, setConfirming] = useState(false);

  if (!state || !viewerId) return null;
  const finished = state.phase === 'finished';
  const alive = state.players.filter((p) => p.alive).length;
  const passes = countPasses(state);
  const current = state.currentPlayerId ? nameOf(state, state.currentPlayerId) : null;

  const onPass = () => {
    setConfirming(false);
    dispatch({ type: 'PASS', playerId: viewerId });
  };
  const onSurrender = () => {
    setConfirming(false);
    dispatch({ type: 'SURRENDER', playerId: viewerId });
  };

  return (
    <div className={cx(styles.root, compact && styles.compact)}>
      <div className={styles.info}>
        {finished ? (
          <span>게임이 끝났습니다</span>
        ) : isMyTurn ? (
          <span className={styles.mine}>내 턴 · 카드를 놓거나 패스</span>
        ) : (
          <span className={styles.other}>{current}의 턴입니다</span>
        )}
        <span className={styles.passes}>
          연속 패스 {passes} / {alive}
        </span>
      </div>
      {confirming ? (
        <div className={styles.actions}>
          <span className={styles.confirmText}>기권하면 즉시 탈락합니다.</span>
          <button type="button" className="pill" onClick={onSurrender}>
            기권 확정
          </button>
          <button type="button" className="pill pill--outline" onClick={() => setConfirming(false)}>
            취소
          </button>
        </div>
      ) : (
        <div className={styles.actions}>
          <button type="button" className="pill" disabled={!isMyTurn} onClick={onPass}>
            패스
          </button>
          <button type="button" className="pill pill--outline" disabled={!isMyTurn} onClick={() => setConfirming(true)}>
            기권
          </button>
        </div>
      )}
    </div>
  );
});
