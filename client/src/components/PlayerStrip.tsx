import { memo, useMemo } from 'react';
import { nameOf } from '@rootbound/shared';
import { buildPlayerSummaries } from '../game/derived';
import { cx } from '../lib/cx';
import { selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { ChangeValue } from './ChangeValue';
import { GameMenu } from './GameMenu';
import { BotIcon, BoltIcon, HourglassIcon, SkullIcon } from './icons';
import { TurnTimer } from './TurnTimer';
import styles from './PlayerStrip.module.css';

/**
 * 화면 맨 위 상태 창: 단계·차례 메타 줄 + 좌석 색 플레이어 카드(땅·예상 점수).
 * 나가기·기권은 ⋯ 메뉴(GameMenu)에 있다.
 */
export const PlayerStrip = memo(function PlayerStrip({ onQuit }: { onQuit: () => void }) {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const autopilot = useGameStore((s) => s.room?.autopilot);
  const rows = useMemo(() => (state ? buildPlayerSummaries(state) : []), [state]);
  if (!state || rows.length === 0) return null;
  const current = state.currentPlayerId ? nameOf(state, state.currentPlayerId) : null;
  const isMyTurn = state.currentPlayerId === viewerId;
  const stage =
    state.phase === 'drafting'
      ? `식물 고르기 ${state.draftIndex + 1}/${state.draftOrder.length}`
      : state.phase === 'playing'
        ? `${state.round}라운드`
        : state.phase === 'finished'
          ? '게임 종료'
          : '대기실';

  return (
    <div className={styles.root}>
      <div className={styles.meta}>
        <span className={styles.round}>{stage}</span>
        <span className={styles.whoTurn}>{state.phase === 'finished' ? '' : isMyTurn ? '내 차례' : `${current ?? ''}의 차례`}</span>
        <TurnTimer />
        <GameMenu onQuit={onQuit} />
      </div>
      <div className={styles.players} role="list" aria-label="플레이어 현황">
        {rows.map((r) => {
          const label = r.surrendered ? '기권' : r.isCurrent ? '차례' : '대기';
          return (
            <div
              key={r.id}
              role="listitem"
              className={cx(styles.card, r.isCurrent && styles.current, r.surrendered && styles.dead)}
              style={{ '--seat-color': `var(--color-seat-${r.seat})` } as React.CSSProperties}
              title={`${r.nickname} · 땅 ${r.score?.land ?? 0} · 점수 ${r.score?.total ?? 0}`}
            >
              <span className={styles.avatar} aria-hidden="true">
                {r.nickname.slice(0, 1)}
              </span>
              <div className={styles.info}>
                <div className={styles.nameRow}>
                  <span className={styles.name}>{r.nickname}</span>
                  {r.id === viewerId && <span className={styles.meTag}>나</span>}
                  {(r.kind === 'ai' || autopilot?.includes(r.id)) && (
                    <span className={styles.race} title={r.kind === 'ai' ? 'AI' : 'AI가 대신 두는 중'}>
                      <BotIcon size={14} />
                    </span>
                  )}
                </div>
                <div className={styles.statsRow}>
                  <span className={styles.score}>
                    땅 <ChangeValue value={r.score?.land ?? 0} />
                  </span>
                  <span className={styles.energy}>
                    <ChangeValue value={r.score?.total ?? 0} />점
                  </span>
                </div>
              </div>
              <span className={cx(styles.stateBadge, r.isCurrent && styles.stateBadgeCurrent, r.surrendered && styles.stateBadgeDead)} title={label} aria-label={label}>
                {r.surrendered ? <SkullIcon size={14} /> : r.isCurrent ? <BoltIcon size={14} /> : <HourglassIcon size={14} />}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
