import { memo, useMemo, type CSSProperties } from 'react';
import { RACES, nameOf } from '@astraltab/shared';
import { RaceArt } from '../game/raceArt';
import { ICONS, Stat } from './CardFace';
import { ChangeValue } from './ChangeValue';
import { GameMenu } from './GameMenu';
import { BoltIcon, HourglassIcon, PassIcon, SkullIcon } from './icons';
import { buildPlayerSummaries } from '../game/derived';
import { cx } from '../lib/cx';
import { selectState, selectViewerId, useGameStore } from '../store/gameStore';
import styles from './PlayerStrip.module.css';

interface PlayerStripProps {
  /** 게임 나가기. 화면 상단이 상태 창 하나뿐이므로 ⋯ 메뉴(GameMenu) 안에 둔다 */
  onQuit: () => void;
}

/**
 * 화면 맨 위, 유일한 상단 요소 (2026-09-23 사용자 지시: 탭 내비는 하단 독으로,
 * 상단에는 플레이어 상태 창만 남긴다). 라운드·턴 메타 줄 + 좌석 색으로 꾸민 플레이어 카드 목록.
 * 2026-10-01: 상태 배지를 아이콘으로, 에너지·점수는 값이 바뀌면 증감이 떠오르게(ChangeValue),
 * 나가기·기권은 ⋯ 메뉴(GameMenu)로 옮겼다.
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
        <GameMenu onQuit={onQuit} />
      </div>
      <div className={styles.players} role="list" aria-label="플레이어 현황 요약">
        {rows.map((r) => {
          const stateLabel = !r.alive ? '탈락' : r.isCurrent ? '진행 중' : r.passed ? '패스' : '대기';
          const stateIcon = !r.alive ? (
            <SkullIcon size={14} />
          ) : r.isCurrent ? (
            <BoltIcon size={14} />
          ) : r.passed ? (
            <PassIcon size={14} />
          ) : (
            <HourglassIcon size={14} />
          );
          return (
            <div
              key={r.id}
              role="listitem"
              className={cx(styles.card, r.isCurrent && styles.current, !r.alive && styles.dead)}
              style={{ '--seat-color': `var(--color-seat-${r.seat})` } as CSSProperties}
              title={`${r.nickname} · 에너지 ${r.energy} (턴당 +${r.income}) · 점수 ${r.total}`}
            >
              <span className={styles.avatar} aria-hidden="true">
                {r.nickname.slice(0, 1)}
              </span>
              <div className={styles.info}>
                <div className={styles.nameRow}>
                  <span className={styles.name}>{r.nickname}</span>
                  {r.id === viewerId && <span className={styles.meTag}>나</span>}
                  {r.race && (
                    <span className={styles.race} title={RACES.find((race) => race.id === r.race)?.name}>
                      <RaceArt raceId={r.race} className={styles.raceIcon} />
                    </span>
                  )}
                </div>
                <div className={styles.statsRow}>
                  <span className={styles.energy}>
                    <Stat icon={ICONS.cost} value={<ChangeValue value={r.energy} />} title="에너지" />
                  </span>
                  <span className={styles.income}>
                    <Stat icon={ICONS.production} value={<ChangeValue value={r.income} format={(n) => `+${n}`} showDelta={false} />} title="턴당 생산" />
                  </span>
                  <span className={styles.score}>
                    <Stat icon={ICONS.score} value={<ChangeValue value={r.total} />} title="점수(덤 포함)" />
                  </span>
                </div>
              </div>
              <span
                className={cx(styles.stateBadge, r.isCurrent && styles.stateBadgeCurrent, !r.alive && styles.stateBadgeDead)}
                title={stateLabel}
                aria-label={stateLabel}
              >
                {stateIcon}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});
