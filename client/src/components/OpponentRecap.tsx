import { memo, useEffect, useRef, useState } from 'react';
import type { GameLogEntry, LogKind } from '@astraltab/shared';
import { selectIsMyTurn, selectState, selectViewerId, useGameStore } from '../store/gameStore';
import styles from './OpponentRecap.module.css';

/** 요약에 넣는 사건 종류. 수입·드로우 같은 정산은 뺀다 */
const RECAP_KINDS: ReadonlySet<LogKind> = new Set<LogKind>(['place', 'magic', 'combat', 'destroy', 'eliminate', 'pass', 'surrender']);
const SHOWN_LINES = 4;

/**
 * 내 차례가 시작될 때 "지난 내 턴 이후 다른 플레이어에게 일어난 일"을 잠깐 띄운다(2026-09-30).
 * 온라인은 상대가 두는 동안 다른 탭을 볼 수 있고, 핫시트는 기기를 넘겨받은 사람이 상황을 모르기 때문이다.
 * 진행 탭 로그를 다시 열어보지 않아도 되게 하는 용도라 새 규칙 계산은 없다(로그 필터만).
 */
export const OpponentRecap = memo(function OpponentRecap() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const isMyTurn = useGameStore(selectIsMyTurn);
  const [lines, setLines] = useState<string[]>([]);
  // 플레이어별로 마지막으로 내 차례를 본 턴 번호
  const lastSeen = useRef(new Map<string, number>());

  const turn = state?.turn ?? 0;
  useEffect(() => {
    if (!state || !viewerId || !isMyTurn) return;
    const floor = lastSeen.current.get(viewerId) ?? Math.max(0, turn - state.players.length);
    lastSeen.current.set(viewerId, turn);
    const entries = state.log.filter(
      (e: GameLogEntry) => e.turn > floor && e.turn < turn && e.playerId !== viewerId && RECAP_KINDS.has(e.kind),
    );
    setLines(entries.map((e) => e.message));
    // 상태 객체 전체가 아니라 턴이 바뀌었을 때만 다시 계산한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, viewerId, isMyTurn]);

  useEffect(() => {
    if (lines.length === 0) return;
    const t = window.setTimeout(() => setLines([]), 8000);
    return () => window.clearTimeout(t);
  }, [lines]);

  if (lines.length === 0) return null;
  const shown = lines.slice(-SHOWN_LINES);
  return (
    <div className={styles.root} role="status">
      <div className={styles.head}>
        <strong>지난 턴 이후</strong>
        <button type="button" className={styles.close} onClick={() => setLines([])} aria-label="닫기">
          ×
        </button>
      </div>
      <ul className={styles.list}>
        {shown.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      {lines.length > shown.length && <div className={styles.more}>앞선 {lines.length - shown.length}건은 진행 탭에서 확인</div>}
    </div>
  );
});
