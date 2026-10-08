import { memo, useMemo } from 'react';
import type { GameLogEntry, LogKind } from '@rootbound/shared';
import { nameOf } from '@rootbound/shared';
import { cx } from '../lib/cx';
import { selectState, useGameStore } from '../store/gameStore';
import styles from './ProgressTab.module.css';

const KIND_LABEL: Record<LogKind, string> = {
  system: '안내',
  draft: '고르기',
  turn: '차례',
  plant: '심기',
  discard: '버림',
  flip: '뺏음',
  surrender: '기권',
  result: '결과',
};

/** 눈에 띄어야 하는 사건. 굵기·테두리로 강조한다 */
const EMPHASIS: ReadonlySet<LogKind> = new Set<LogKind>(['flip', 'result', 'surrender']);

/**
 * 진행 탭 (F012): 이벤트 로그(최신 순, 영역 안 스크롤). 기권·나가기는 상단 ⋯ 메뉴에 있다.
 */
export const ProgressTab = memo(function ProgressTab() {
  const state = useGameStore(selectState);
  const entries = useMemo(() => (state ? [...state.log].reverse() : []), [state]);

  if (!state) return null;
  const active = state.players.filter((p) => p.surrenderedOrder === null).length;
  const cardsLeft = state.players.reduce((n, p) => n + p.handCount + p.deckCount, 0);
  const current = state.currentPlayerId ? nameOf(state, state.currentPlayerId) : null;

  return (
    <div className={styles.root}>
      <aside className={styles.side}>
        <div className={styles.summary}>
          <h2 className={styles.title}>현재</h2>
          <dl className={styles.facts}>
            <dt>단계</dt>
            <dd>{state.phase === 'drafting' ? '식물 고르기' : state.phase === 'playing' ? `${state.round}라운드` : state.phase === 'finished' ? '종료' : '대기실'}</dd>
            <dt>차례</dt>
            <dd>{state.turn}</dd>
            <dt>지금</dt>
            <dd>{state.phase === 'finished' ? '종료' : current}</dd>
            <dt>남은 카드</dt>
            <dd>{cardsLeft}장 · {active}명</dd>
          </dl>
        </div>
      </aside>
      <section className={styles.logPanel} aria-label="진행 기록">
        <h2 className={styles.title}>
          진행 기록 <span className={styles.sub}>{entries.length}건 · 최신 순</span>
        </h2>
        <ol className={styles.log}>
          {entries.map((e, i) => (
            <LogRow key={entries.length - i} entry={e} playerName={e.playerId ? nameOf(state, e.playerId) : null} />
          ))}
        </ol>
      </section>
    </div>
  );
});

const LogRow = memo(function LogRow({ entry, playerName }: { entry: GameLogEntry; playerName: string | null }) {
  return (
    <li className={cx(styles.row, EMPHASIS.has(entry.kind) && styles.emphasis)} data-kind={entry.kind}>
      <span className={styles.turn}>차례 {entry.turn}</span>
      <span className={styles.kind}>{KIND_LABEL[entry.kind]}</span>
      <span className={styles.who}>{playerName ?? '—'}</span>
      <span className={styles.message}>{entry.message}</span>
    </li>
  );
});
