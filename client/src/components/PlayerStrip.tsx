import { memo, useMemo } from 'react';
import { buildPlayerSummaries } from '../game/derived';
import { cx } from '../lib/cx';
import { selectState, selectViewerId, useGameStore } from '../store/gameStore';
import styles from './PlayerStrip.module.css';

/**
 * 모든 플레이어의 에너지·점수·상태를 탭 전환 없이 한눈에 보여주는 상시 표시 영역.
 * 헤더 아래, 모든 탭에서 공통으로 보인다.
 */
export const PlayerStrip = memo(function PlayerStrip() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const rows = useMemo(() => (state ? buildPlayerSummaries(state) : []), [state]);

  if (!state || rows.length === 0) return null;

  return (
    <div className={styles.root} role="list" aria-label="플레이어 현황 요약">
      {rows.map((r) => (
        <div
          key={r.id}
          role="listitem"
          className={cx(styles.chip, r.isCurrent && styles.current, !r.alive && styles.dead, r.id === viewerId && styles.me)}
          title={`${r.nickname} · 에너지 ${r.energy} · 점수 ${r.total}`}
        >
          <span className={styles.badge} data-seat={r.seat} aria-hidden="true" />
          <span className={styles.name}>{r.nickname}</span>
          <span className={styles.energy}>{r.energy}</span>
          <span className={styles.score}>{r.total}점</span>
          <span className={styles.state}>{!r.alive ? '탈락' : r.isCurrent ? '진행 중' : r.passed ? '패스' : '대기'}</span>
        </div>
      ))}
    </div>
  );
});
