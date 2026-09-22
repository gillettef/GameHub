import { memo, useMemo } from 'react';
import type { GameLogEntry, LogKind } from '@astraltab/shared';
import { nameOf } from '@astraltab/shared';
import { TurnControls } from '../components/TurnControls';
import { cx } from '../lib/cx';
import { selectState, useGameStore } from '../store/gameStore';
import styles from './ProgressTab.module.css';

const KIND_LABEL: Record<LogKind, string> = {
  system: '시스템',
  turn: '턴',
  combat: '전투',
  repair: '정비',
  expire: '만료',
  income: '수입',
  draw: '드로우',
  place: '배치',
  magic: '마법',
  destroy: '파괴',
  eliminate: '탈락',
  pass: '패스',
  surrender: '기권',
  result: '결과',
};

/** 눈에 띄어야 하는 사건. 경고색은 미정이라 굵기·테두리로만 강조한다 */
const EMPHASIS: ReadonlySet<LogKind> = new Set<LogKind>(['combat', 'destroy', 'eliminate', 'result', 'surrender']);

/**
 * 진행 탭 (F012, F013): 이벤트 로그(최신 순, 영역 안 스크롤) + 패스/기권.
 */
export const ProgressTab = memo(function ProgressTab() {
  const state = useGameStore(selectState);
  const entries = useMemo(() => (state ? [...state.log].reverse() : []), [state]);

  if (!state) return null;
  const alive = state.players.filter((p) => p.alive).length;
  const current = state.currentPlayerId ? nameOf(state, state.currentPlayerId) : null;

  return (
    <div className={styles.root}>
      <section className={styles.logPanel} aria-label="게임 로그">
        <h2 className={styles.title}>
          진행 기록 <span className={styles.sub}>{entries.length}건 · 최신 순</span>
        </h2>
        <ol className={styles.log}>
          {entries.map((e, i) => (
            <LogRow key={entries.length - i} entry={e} playerName={e.playerId ? nameOf(state, e.playerId) : null} />
          ))}
        </ol>
      </section>
      <aside className={styles.side}>
        <div className={styles.summary}>
          <h2 className={styles.title}>현재</h2>
          <dl className={styles.facts}>
            <dt>라운드</dt>
            <dd>
              {state.round} / {state.roundLimit}
            </dd>
            <dt>턴</dt>
            <dd>{state.turn}</dd>
            <dt>차례</dt>
            <dd>{state.phase === 'finished' ? '종료' : current}</dd>
            <dt>생존</dt>
            <dd>{alive}명</dd>
          </dl>
        </div>
        <TurnControls />
      </aside>
    </div>
  );
});

const LogRow = memo(function LogRow({ entry, playerName }: { entry: GameLogEntry; playerName: string | null }) {
  return (
    <li className={cx(styles.row, EMPHASIS.has(entry.kind) && styles.emphasis)} data-kind={entry.kind}>
      <span className={styles.turn}>{entry.turn}턴</span>
      <span className={styles.kind}>{KIND_LABEL[entry.kind]}</span>
      <span className={styles.who}>{playerName ?? '—'}</span>
      <span className={styles.message}>{entry.message}</span>
    </li>
  );
});
