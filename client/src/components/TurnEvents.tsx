import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { GameLogEntry, LogKind } from '@rootbound/shared';
import { nameOf } from '@rootbound/shared';
import { selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { BoltIcon, PassIcon, PlaceIcon, SurrenderIcon, SwordIcon } from './icons';
import styles from './TurnEvents.module.css';

/** 연출에 올리는 사건 종류 */
const SHOWN_KINDS: ReadonlySet<LogKind> = new Set<LogKind>(['plant', 'flip', 'discard', 'surrender']);
const MAX_ITEMS = 6;
const SPLASH_MS = 1100;
const ITEM_MS = 450;

const KIND_ICON: Partial<Record<LogKind, ReactNode>> = {
  plant: <PlaceIcon size={18} />,
  flip: <SwordIcon size={18} />,
  discard: <PassIcon size={18} />,
  surrender: <SurrenderIcon size={18} />,
};

/** 로그 문장을 칩에 들어가는 짧은 문구로 줄인다. 형식을 못 알아보면 원문을 그대로 쓴다 */
function shorten(e: GameLogEntry): string {
  switch (e.kind) {
    case 'plant': {
      const m = e.message.match(/\)에 ([^,]+)/);
      return m ? `${m[1]} 심음` : e.message;
    }
    case 'flip': {
      const m = e.message.match(/^.*?: (.+)의 땅 (\d+)칸을 가져갔습니다$/);
      return m ? `${m[1]} 땅 ${m[2]}칸 뺏음` : e.message;
    }
    case 'discard':
      return '버림';
    case 'surrender':
      return '기권';
    default:
      return e.message;
  }
}

interface Item {
  key: number;
  kind: LogKind;
  seat: number | null;
  text: string;
}

interface Batch {
  key: number;
  mine: boolean;
  name: string;
  seat: number;
  items: Item[];
}

/**
 * 턴 전환 연출 (2026-10-01 사용자 지시: 턴과 턴 사이에 무슨 일이 있었는지 눈으로 보이게).
 * 차례가 넘어갈 때마다 "누구 차례" 스플래시와, 방금 끝난 차례에 일어난 사건(심기·뺏기·버리기·기권)을
 * 아이콘 칩으로 차례차례 보여 준다. 예전 OpponentRecap(텍스트 목록)을 대체한다.
 * 새 규칙 계산은 없다 — 로그 필터와 문구 줄이기뿐이다. 핫시트는 기기 넘김 화면이 닫힌 뒤에 보여 준다.
 */
export const TurnEvents = memo(function TurnEvents() {
  const state = useGameStore(selectState);
  const viewerId = useGameStore(selectViewerId);
  const handoffPending = useGameStore((s) => s.handoffPending);
  const lastTurn = useRef<number | null>(null);
  const counter = useRef(0);
  const [batch, setBatch] = useState<Batch | null>(null);

  const turn = state?.turn ?? null;
  const phase = state?.phase ?? null;
  useEffect(() => {
    if (!state || turn === null) return;
    if (lastTurn.current === null) {
      lastTurn.current = turn;
      return;
    }
    if (turn === lastTurn.current) return;
    const from = lastTurn.current;
    lastTurn.current = turn;
    // 게임이 끝나면 결과 화면이 이어받는다
    if (state.phase !== 'playing' || !state.currentPlayerId) {
      setBatch(null);
      return;
    }
    const seatOf = (id: string | null) => (id ? (state.players.find((p) => p.id === id)?.seat ?? null) : null);
    const items = state.log
      .filter((e) => e.turn >= from && e.turn < turn && SHOWN_KINDS.has(e.kind))
      .slice(-MAX_ITEMS)
      .map<Item>((e) => ({ key: counter.current++, kind: e.kind, seat: seatOf(e.playerId), text: shorten(e) }));
    const current = state.players.find((p) => p.id === state.currentPlayerId);
    setBatch({
      key: counter.current++,
      mine: state.currentPlayerId === viewerId,
      name: nameOf(state, state.currentPlayerId),
      seat: current?.seat ?? 0,
      items,
    });
    // 상태 객체 전체가 아니라 턴이 바뀌었을 때만 다시 계산한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, phase]);

  const visible = batch !== null && !handoffPending;
  useEffect(() => {
    if (!visible || !batch) return;
    const t = window.setTimeout(() => setBatch(null), SPLASH_MS + Math.min(batch.items.length, MAX_ITEMS) * ITEM_MS + 1200);
    return () => window.clearTimeout(t);
  }, [visible, batch]);

  if (!visible || !batch) return null;
  return (
    <div className={styles.root} key={batch.key} role="status" aria-live="polite">
      <div className={styles.splash} style={{ '--seat-color': `var(--color-seat-${batch.seat})` } as CSSProperties}>
        <span className={styles.avatar} aria-hidden="true">
          {batch.mine ? <BoltIcon size={16} /> : batch.name.slice(0, 1)}
        </span>
        <strong>{batch.mine ? '내 차례' : `${batch.name} 차례`}</strong>
      </div>
      <ul className={styles.items}>
        {batch.items.map((it, i) => (
          <li
            key={it.key}
            className={styles.item}
            data-kind={it.kind}
            style={
              {
                '--seat-color': it.seat === null ? 'var(--color-muted)' : `var(--color-seat-${it.seat})`,
                animationDelay: `${SPLASH_MS * 0.5 + i * ITEM_MS}ms`,
              } as CSSProperties
            }
          >
            <span className={styles.icon}>{KIND_ICON[it.kind]}</span>
            <span className={styles.text}>{it.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
});
