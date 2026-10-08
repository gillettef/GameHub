import { memo, useEffect } from 'react';
import { playCue } from '../lib/cues';
import { formatRemaining, useTurnRemaining } from '../lib/turnClock';
import { cx } from '../lib/cx';
import { useGameStore } from '../store/gameStore';
import { TimerIcon } from './icons';
import styles from './TurnTimer.module.css';

/** 이 초 이하로 남으면 경고색으로 바뀌고, 내 차례면 초마다 똑딱 소리를 낸다 */
const WARN_SEC = 10;

/**
 * 턴 제한 시간 남은 시간 (Rules.md 5.4, 온라인 전용). 상단 상태 창 메타 줄에 붙는다.
 * 제한이 없거나 AI 턴·AI 대리 중이면 아무것도 그리지 않는다. 시간 초과 판정은 서버가 한다.
 */
export const TurnTimer = memo(function TurnTimer() {
  const room = useGameStore((s) => s.room);
  const receivedAt = useGameStore((s) => s.roomReceivedAt);
  const isMine = useGameStore((s) => s.state?.currentPlayerId === s.viewerId);
  const remaining = useTurnRemaining(room, receivedAt);

  useEffect(() => {
    if (isMine && remaining !== null && remaining > 0 && remaining <= WARN_SEC) playCue('tick');
  }, [isMine, remaining]);

  if (remaining === null) return null;
  const warn = remaining <= WARN_SEC;
  return (
    <span className={cx(styles.timer, warn && styles.warn, warn && isMine && styles.pulse)} role="timer" aria-live={warn && isMine ? 'assertive' : 'off'} title="이 차례의 남은 시간. 지나면 자동으로 둡니다">
      <TimerIcon size={14} />
      {formatRemaining(remaining)}
    </span>
  );
});
