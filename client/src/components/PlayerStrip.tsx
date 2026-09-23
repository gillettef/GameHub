import { memo, useMemo, type CSSProperties } from 'react';
import { nameOf } from '@astraltab/shared';
import { buildPlayerSummaries } from '../game/derived';
import { cx } from '../lib/cx';
import { selectState, selectViewerId, useGameStore } from '../store/gameStore';
import styles from './PlayerStrip.module.css';

interface PlayerStripProps {
  /** 게임 나가기. 화면 상단이 상태 창 하나뿐이므로 여기 작은 아이콘 버튼으로 둔다 */
  onQuit: () => void;
}

/**
 * 화면 맨 위, 유일한 상단 요소 (2026-09-23 사용자 지시: 탭 내비는 하단 독으로,
 * 상단에는 플레이어 상태 창만 남긴다). 라운드·턴 메타 줄 + 좌석 색으로 꾸민 플레이어 카드 목록.
 */
export const PlayerStrip = memo(function PlayerStrip({ onQuit }: PlayerStripProps) {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const rows = useMemo(() => (state ? buildPlayerSummaries(state) : []), [state]);

  if (!state || rows.length === 0) return null;
  const current = state.currentPlayerId ? nameOf(state, state.currentPlayerId) : null;
  const isMyTurn = state.currentPlayerId === viewerId;

  return (
    <div className={styles.root}>
      <div className={styles.meta}>
        <span className={styles.round}>
          라운드 {state.round}
          <span className={styles.limit}>/{state.roundLimit}</span>
        </span>
        <span className={styles.turnNum}>{state.turn}턴</span>
        <span className={styles.whoTurn}>
          {state.phase === 'finished' ? '게임 종료' : isMyTurn ? '내 차례' : `${current}의 차례`}
        </span>
        <button type="button" className={styles.quit} onClick={onQuit}>
          나가기
        </button>
      </div>
      <div className={styles.players} role="list" aria-label="플레이어 현황 요약">
        {rows.map((r) => {
          const stateLabel = !r.alive ? '탈락' : r.isCurrent ? '진행 중' : r.passed ? '패스' : '대기';
          return (
            <div
              key={r.id}
              role="listitem"
              className={cx(styles.card, r.isCurrent && styles.current, !r.alive && styles.dead)}
              style={{ '--seat-color': `var(--color-seat-${r.seat})` } as CSSProperties}
              title={`${r.nickname} · 에너지 ${r.energy} · 점수 ${r.total}`}
            >
              <span className={styles.avatar} aria-hidden="true">
                {r.nickname.slice(0, 1)}
              </span>
              <div className={styles.info}>
                <div className={styles.nameRow}>
                  <span className={styles.name}>{r.nickname}</span>
                  {r.id === viewerId && <span className={styles.meTag}>나</span>}
                </div>
                <div className={styles.statsRow}>
                  <span className={styles.energy}>{r.energy} 에너지</span>
                  <span className={styles.score}>{r.total}점</span>
                </div>
              </div>
              <span className={cx(styles.stateBadge, r.isCurrent && styles.stateBadgeCurrent, !r.alive && styles.stateBadgeDead)}>
                {stateLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
