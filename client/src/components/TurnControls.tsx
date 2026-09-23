import { memo } from 'react';
import { countPasses, nameOf } from '@astraltab/shared';
import { cx } from '../lib/cx';
import { selectIsMyTurn, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import styles from './TurnControls.module.css';

interface TurnControlsProps {
  /** 좁은 자리(보드 탭 하단)용 */
  compact?: boolean;
}

/**
 * 패스·턴 종료·기권 (F013). 한 턴에 배치는 한 번만 할 수 있다(Rules.md 5.2, 2026-09-23).
 * 같은 버튼이 이번 턴에 아직 안 놓았으면 '패스', 이미 놓았으면 '턴 종료' 로 라벨을 바꾼다 —
 * 후자는 전원 연속 패스 판정에 들어가지 않는다.
 * 기권 확인 단계는 스토어에 있어 보드·진행 탭이 같은 상태를 보고, 턴이 바뀌면 자동으로 풀린다.
 */
export const TurnControls = memo(function TurnControls({ compact }: TurnControlsProps) {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const isMyTurn = useGameStore(selectIsMyTurn);
  const confirming = useGameStore((s) => s.surrenderConfirming);
  const setConfirming = useGameStore((s) => s.setSurrenderConfirming);
  const pass = useGameStore((s) => s.pass);
  const surrender = useGameStore((s) => s.surrender);

  if (!state || !viewerId) return null;
  const finished = state.phase === 'finished';
  const alive = state.players.filter((p) => p.alive).length;
  const passes = countPasses(state);
  const current = state.currentPlayerId ? nameOf(state, state.currentPlayerId) : null;
  const me = state.players.find((p) => p.id === viewerId);
  const acted = me?.actedThisTurn ?? false;
  const endLabel = acted ? '턴 종료' : '패스';

  return (
    <div className={cx(styles.root, compact && styles.compact)}>
      <div className={styles.info}>
        {finished ? (
          <span>게임이 끝났습니다</span>
        ) : me && !me.alive ? (
          <span className={styles.other}>탈락했습니다. 관전 중</span>
        ) : isMyTurn ? (
          <span className={styles.mine}>내 턴 · {acted ? `배치 완료, ${endLabel}` : `카드 한 장을 놓거나 ${endLabel}`}</span>
        ) : (
          <span className={styles.other}>{current}의 턴입니다</span>
        )}
        <span className={styles.passes}>
          연속 패스 {passes} / {alive}
        </span>
      </div>
      {confirming && isMyTurn ? (
        <div className={styles.actions}>
          <span className={styles.confirmText}>기권하면 즉시 탈락합니다.</span>
          <button type="button" className="pill" disabled={!isMyTurn} onClick={surrender}>
            기권 확정
          </button>
          <button type="button" className="pill pill--outline" onClick={() => setConfirming(false)}>
            취소
          </button>
        </div>
      ) : (
        <div className={styles.actions}>
          <button type="button" className="pill" disabled={!isMyTurn} onClick={pass}>
            {endLabel}
          </button>
          <button type="button" className="pill pill--outline" disabled={!isMyTurn} onClick={() => setConfirming(true)}>
            기권
          </button>
        </div>
      )}
    </div>
  );
});
