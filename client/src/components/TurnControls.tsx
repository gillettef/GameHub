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
 *
 * 2026-09-24 사용자 지시로 세로 높이를 줄이고 알약(pill) 모양의 떠 있는 바 하나로 다시 그렸다.
 * 상태 문구는 짧게 줄이고(자세한 설명은 손패 서랍·상태 탭이 이미 보여준다), 연속 패스는 작은
 * 배지로, 버튼은 이 컴포넌트 안에서만 낮춘 높이(:global(.pill) 오버라이드)를 쓴다.
 */
export const TurnControls = memo(function TurnControls({ compact }: TurnControlsProps) {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const isMyTurn = useGameStore(selectIsMyTurn);
  const confirming = useGameStore((s) => s.surrenderConfirming);
  const setConfirming = useGameStore((s) => s.setSurrenderConfirming);
  const pass = useGameStore((s) => s.pass);
  const surrender = useGameStore((s) => s.surrender);
  const discardMode = useGameStore((s) => s.discardMode);
  const discardIndices = useGameStore((s) => s.discardIndices);
  const toggleDiscardMode = useGameStore((s) => s.toggleDiscardMode);

  if (!state || !viewerId) return null;
  const finished = state.phase === 'finished';
  const alive = state.players.filter((p) => p.alive).length;
  const passes = countPasses(state);
  const current = state.currentPlayerId ? nameOf(state, state.currentPlayerId) : null;
  const me = state.players.find((p) => p.id === viewerId);
  const acted = me?.actedThisTurn ?? false;
  const discardCount = discardIndices.length;
  const endLabel = (acted ? '턴 종료' : '패스') + (discardCount > 0 ? ` (${discardCount}장 교체)` : '');

  const status = finished
    ? '게임 종료'
    : me && !me.alive
      ? '관전 중'
      : isMyTurn
        ? acted
          ? '배치 완료'
          : '내 차례'
        : `${current} 차례`;

  return (
    <div className={cx(styles.root, compact && styles.compact)}>
      {confirming && isMyTurn ? (
        <div className={styles.row}>
          <span className={styles.confirmText}>기권하면 즉시 탈락합니다</span>
          <button type="button" className="pill" onClick={surrender}>
            확정
          </button>
          <button type="button" className="pill pill--outline" onClick={() => setConfirming(false)}>
            취소
          </button>
        </div>
      ) : (
        <div className={styles.row}>
          <span className={cx(styles.status, isMyTurn && styles.statusMine)}>{status}</span>
          <span className={styles.passesBadge} title={`연속 패스 ${passes} / ${alive}`}>
            {passes}/{alive}
          </span>
          <button
            type="button"
            className={cx('pill', 'pill--outline', discardMode && styles.discardActive)}
            disabled={!isMyTurn}
            onClick={toggleDiscardMode}
            title="패스/턴 종료 시 함께 버리고 다시 뽑을 카드를 고릅니다"
          >
            손패 교체{discardCount > 0 ? ` ${discardCount}` : ''}
          </button>
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
