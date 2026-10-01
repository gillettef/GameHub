import { memo, useEffect, useState } from 'react';
import { countPasses, hasAnyPlay, nameOf } from '@astraltab/shared';
import { cx } from '../lib/cx';
import { selectIsMyTurn, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { CheckIcon, PassIcon, SwapIcon } from './icons';
import styles from './TurnControls.module.css';

interface TurnControlsProps {
  /** 좁은 자리(보드 탭 하단)용 */
  compact?: boolean;
}

/**
 * 패스·턴 종료·기권 (F013). 한 턴에 배치는 한 번만 할 수 있다(Rules.md 5.2, 2026-09-23).
 * 같은 버튼이 이번 턴에 아직 안 놓았으면 '패스', 이미 놓았으면 '턴 종료' 로 라벨을 바꾼다 —
 * 후자는 전원 연속 패스 판정에 들어가지 않는다.
 * 기권·나가기는 2026-10-01부터 상단 ⋯ 메뉴(GameMenu)로 옮겼다 — 패스 바로 옆에서 오탭되던 위험을 없앴다.
 * 2026-10-01 사용자 지시로 버튼을 아이콘 위주(교체=순환 화살표, 패스=건너뛰기, 턴 종료=체크)로 바꿨다.
 *
 * 2026-09-24 사용자 지시로 세로 높이를 줄이고 알약(pill) 모양의 떠 있는 바 하나로 다시 그렸다.
 * 상태 문구는 짧게 줄이고(자세한 설명은 손패 서랍·상태 탭이 이미 보여준다), 연속 패스는 작은
 * 배지로, 버튼은 이 컴포넌트 안에서만 낮춘 높이(:global(.pill) 오버라이드)를 쓴다.
 */
export const TurnControls = memo(function TurnControls({ compact }: TurnControlsProps) {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const isMyTurn = useGameStore(selectIsMyTurn);
  const pass = useGameStore((s) => s.pass);
  const discardMode = useGameStore((s) => s.discardMode);
  const discardCardIds = useGameStore((s) => s.discardCardIds);
  const toggleDiscardMode = useGameStore((s) => s.toggleDiscardMode);

  // 낼 수 있는 카드가 남았는데 배치 없이 패스하려면 한 번 더 눌러 확인한다(오탭 방지, 턴이 즉시 끝나 되돌릴 수 없다)
  const [passArmed, setPassArmed] = useState(false);
  useEffect(() => {
    if (!passArmed) return;
    const t = window.setTimeout(() => setPassArmed(false), 3000);
    return () => window.clearTimeout(t);
  }, [passArmed]);
  useEffect(() => setPassArmed(false), [state?.turn]);

  if (!state || !viewerId) return null;
  const finished = state.phase === 'finished';
  const alive = state.players.filter((p) => p.alive).length;
  const passes = countPasses(state);
  const current = state.currentPlayerId ? nameOf(state, state.currentPlayerId) : null;
  const me = state.players.find((p) => p.id === viewerId);
  const acted = me?.actedThisTurn ?? false;
  const discardCount = discardCardIds.length;
  const wouldWaste = !acted && isMyTurn && state.phase === 'playing' && hasAnyPlay(state, viewerId);

  const status = finished
    ? '게임 종료'
    : me && !me.alive
      ? '관전 중'
      : isMyTurn
        ? acted
          ? '배치 완료'
          : '내 차례'
        : `${current} 차례`;

  const endName = acted ? '턴 종료' : '패스';
  const endTitle = wouldWaste
    ? '낼 수 있는 카드가 남아 있습니다. 한 번 더 누르면 패스합니다'
    : discardCount > 0
      ? `${endName} · 카드 ${discardCount}장을 덱과 섞어 다시 뽑습니다`
      : endName;

  return (
    <div className={cx(styles.root, compact && styles.compact)}>
      <div className={styles.row}>
        <span className={cx(styles.status, isMyTurn && styles.statusMine)}>{status}</span>
        <span className={styles.passesBadge} title={`연속 패스 ${passes} / ${alive}`} aria-label={`연속 패스 ${passes} / ${alive}`}>
          <PassIcon size={12} />
          {passes}/{alive}
        </span>
        <button
          type="button"
          className={cx(styles.iconBtn, discardMode && styles.discardActive)}
          disabled={!isMyTurn}
          onClick={toggleDiscardMode}
          title={discardMode ? '교체 모드 끄기' : '손패 교체: 버릴 카드를 골라 덱과 섞어 다시 뽑기'}
          aria-label={discardMode ? '교체 모드 끄기' : '손패 교체: 버릴 카드를 골라 덱과 섞어 다시 뽑기'}
          aria-pressed={discardMode}
        >
          <SwapIcon />
          {discardCount > 0 && <span className={styles.count}>{discardCount}</span>}
        </button>
        <button
          type="button"
          className={cx(styles.endBtn, passArmed && styles.armed, discardCount > 0 && styles.withDiscard)}
          disabled={!isMyTurn}
          onClick={() => {
            if (wouldWaste && !passArmed) setPassArmed(true);
            else pass();
          }}
          title={endTitle}
          aria-label={passArmed ? `한 번 더 누르면 ${endName}` : endTitle}
        >
          {acted ? <CheckIcon /> : <PassIcon />}
          {passArmed && <span className={styles.armedText}>한 번 더</span>}
          {!passArmed && discardCount > 0 && (
            <span className={styles.endSwap}>
              <SwapIcon size={14} />
              {discardCount}
            </span>
          )}
        </button>
      </div>
    </div>
  );
});
