import { memo, useMemo } from 'react';
import { nameOf } from '@rootbound/shared';
import { buildPlayerSummaries } from '../game/derived';
import { cx } from '../lib/cx';
import { selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { ChangeValue } from './ChangeValue';
import { GameMenu } from './GameMenu';
import { BotIcon, BoltIcon, CheckIcon, HourglassIcon, SkullIcon } from './icons';
import { TurnTimer } from './TurnTimer';
import styles from './PlayerStrip.module.css';

/**
 * 화면 맨 위 상태 창: 단계(N라운드 · 가져오기/심기)·차례 메타 줄 + 좌석 색 플레이어 카드(땅·예상 점수, 이번 라운드 선 표시).
 * 이번 판 식물 공개 단계에는 자리별 확인 여부를 보여 준다.
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
  const reveal = state.phase === 'reveal';
  const stage =
    state.phase === 'playing'
      ? `${state.round}라운드 · ${state.stage === 'take' ? '가져오기' : '심기'}`
      : state.phase === 'finished'
        ? '게임 종료'
        : reveal
          ? '이번 판 식물 공개'
          : '대기실';
  const active = state.players.filter((p) => p.surrenderedOrder === null);
  const who =
    state.phase === 'finished'
      ? ''
      : reveal
        ? `확인 ${active.filter((p) => p.isReady).length}/${active.length}`
        : isMyTurn
          ? '내 차례'
          : `${current ?? ''}의 차례`;

  return (
    <div className={styles.root}>
      <div className={styles.meta}>
        <span className={styles.round}>{stage}</span>
        <span className={styles.whoTurn}>{who}</span>
        <TurnTimer />
        <GameMenu onQuit={onQuit} />
      </div>
      <div className={styles.players} role="list" aria-label="플레이어 현황">
        {rows.map((r) => {
          const ready = reveal && (state.players.find((p) => p.id === r.id)?.isReady ?? false);
          const label = r.surrendered ? '기권' : reveal ? (ready ? '확인함' : '확인 전') : r.isCurrent ? '차례' : '대기';
          const lead = state.phase === 'playing' && r.seat === state.roundStart && !r.surrendered;
          return (
            <div
              key={r.id}
              role="listitem"
              className={cx(styles.card, r.isCurrent && styles.current, r.surrendered && styles.dead)}
              style={{ '--seat-color': `var(--color-seat-${r.seat})` } as React.CSSProperties}
              title={`${r.nickname} · 땅 ${r.score?.land ?? 0} · 점수 ${r.score?.total ?? 0} · 남은 뿌리 ${r.rootsLeft ?? 0}`}
            >
              <span className={styles.avatar} aria-hidden="true">
                {r.nickname.slice(0, 1)}
              </span>
              <div className={styles.info}>
                <div className={styles.nameRow}>
                  <span className={styles.name}>{r.nickname}</span>
                  {r.id === viewerId && <span className={styles.meTag}>나</span>}
                  {lead && (
                    <span className={styles.leadTag} title="이번 라운드 선: 가장 먼저 둡니다">
                      선
                    </span>
                  )}
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
                  {r.rootsLeft !== null && (
                    <span className={styles.score} title="남은 뿌리: 라운드가 끝나면 가장 많이 남은 사람이 다음 선">
                      뿌리 {r.rootsLeft}
                    </span>
                  )}
                </div>
              </div>
              <span className={cx(styles.stateBadge, (r.isCurrent || ready) && styles.stateBadgeCurrent, r.surrendered && styles.stateBadgeDead)} title={label} aria-label={label}>
                {r.surrendered ? <SkullIcon size={14} /> : ready ? <CheckIcon size={14} /> : r.isCurrent ? <BoltIcon size={14} /> : <HourglassIcon size={14} />}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
