import { memo, useMemo } from 'react';
import type { GameLogEntry, LogKind } from '../../engine';
import { nameOf } from '../../engine';
import { phaseLabel } from '../game/derived';
import { cx } from '../lib/cx';
import { selectState, useGameStore } from '../store/gameStore';
import styles from './ProgressTab.module.css';

const KIND_LABEL: Record<LogKind, string> = {
  system: '안내',
  take: '가져옴',
  turn: '차례',
  plant: '놓기',
  discard: '버림',
  flip: '빼앗음',
  uproot: '데려옴',
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
  const cardsLeft = state.players.reduce((n, p) => n + p.handCount, 0) + state.market.length + state.pileCount;
  const current = state.currentPlayerId ? nameOf(state, state.currentPlayerId) : null;
  const lead = state.phase === 'playing' ? state.players.find((p) => p.seat === state.roundStart) : undefined;
  const stage = phaseLabel(state, '종료');

  return (
    <div className={styles.root}>
      <aside className={styles.side}>
        <div className={styles.summary}>
          <h2 className={styles.title}>현재</h2>
          <dl className={styles.facts}>
            <dt>단계</dt>
            <dd>{stage}</dd>
            {lead && (
              <>
                <dt>선</dt>
                <dd title="이번 라운드에 먼저 두는 사람. 라운드가 끝나면 쉬는 고양이가 가장 많은 사람이 다음 선입니다">{lead.nickname}</dd>
              </>
            )}
            <dt>차례</dt>
            <dd>{state.turn}</dd>
            <dt>지금</dt>
            <dd>{state.phase === 'finished' ? '종료' : state.phase === 'reveal' ? '모두 확인하면 시작' : current}</dd>
            <dt>남은 타일</dt>
            <dd>{cardsLeft}개 · {active}명</dd>
            <dt>주머니</dt>
            <dd>{state.pileCount}개 · 펼친 타일 {state.market.length}개</dd>
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
