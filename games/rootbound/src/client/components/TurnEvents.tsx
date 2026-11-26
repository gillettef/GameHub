import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { GameLogEntry, LogKind } from '../../engine';
import { nameOf } from '../../engine';
import { stageName } from '../game/derived';
import { selectState, selectViewerId, useGameStore } from '../store/gameStore';
import { BoltIcon, CheckIcon, HelpIcon, PassIcon, PlaceIcon, SurrenderIcon, SwapIcon, SwordIcon } from './icons';
import styles from './TurnEvents.module.css';

/** 연출에 올리는 사건 종류 (v7: 일과 고르기·생선 냄새·담 넘기·명당 부르기·쉼 포함) */
const SHOWN_KINDS: ReadonlySet<LogKind> = new Set<LogKind>(['chore', 'peek', 'plant', 'take', 'move', 'call', 'flip', 'discard', 'pass', 'surrender']);
const MAX_ITEMS = 6;
const SPLASH_MS = 1100;
const ITEM_MS = 450;

const KIND_ICON: Partial<Record<LogKind, ReactNode>> = {
  plant: <PlaceIcon size={18} />,
  take: <SwapIcon size={18} />,
  flip: <SwordIcon size={18} />,
  discard: <PassIcon size={18} />,
  surrender: <SurrenderIcon size={18} />,
  chore: <CheckIcon size={18} />,
  peek: <HelpIcon size={18} />,
  move: <BoltIcon size={18} />,
  call: <PlaceIcon size={18} />,
  pass: <PassIcon size={18} />,
};

/** 로그 문장을 칩에 들어가는 짧은 문구로 줄인다. 형식을 못 알아보면 원문을 그대로 쓴다 */
function shorten(e: GameLogEntry): string {
  switch (e.kind) {
    case 'plant': {
      // turn.ts 놓기 로그: "닉네임: C4에 평상 놓음" / "닉네임: C4에 캣닢 화분 놓음, 멀리 D6" / "…, 식빵 굽기 +1"
      const m = e.message.match(/: ([A-Z]\d+)에 ([^:,]+) 놓음(?:, 멀리 ([A-Z]\d+))?(?:, 식빵 굽기 \+(\d+))?$/);
      return m ? `${m[1]} ${m[2]} 놓음${m[3] ? ` · 멀리 ${m[3]}` : ''}${m[4] ? ` · 식빵 +${m[4]}` : ''}` : e.message;
    }
    case 'take': {
      // turn.ts 가져오기 로그: "닉네임: 펼친 타일에서 종이 상자 가져옴" / "닉네임: 주머니에서 1개 뽑음"
      if (/: 주머니에서 1개 뽑음$/.test(e.message)) return '주머니에서 1개';
      const m = e.message.match(/: (?:펼친 타일에서|생선 냄새로 편) ([^:]+) 가져옴$/);
      return m ? `${m[1]} 가져옴` : e.message;
    }
    case 'chore': {
      // turn.ts 일과 로그: "닉네임: 일과 「식빵 굽기」 고름"
      const m = e.message.match(/일과 「([^」]+)」 고름$/);
      return m ? `「${m[1]}」 고름` : e.message;
    }
    case 'peek': {
      // "닉네임: 생선 냄새로 주머니 맨 위 평상을(를) 펼침" / "닉네임: 펼쳤던 평상을(를) 주머니 맨 위로 되돌림"
      const open = e.message.match(/주머니 맨 위 (.+)을\(를\) 펼침$/);
      if (open) return `생선 냄새 · ${open[1]} 펼침`;
      const back = e.message.match(/펼쳤던 (.+)을\(를\) 주머니 맨 위로 되돌림$/);
      return back ? `${back[1]} 주머니로` : e.message;
    }
    case 'move': {
      // "닉네임: C4의 고양이 2마리가 D5(으)로 담을 넘음"
      const m = e.message.match(/: ([A-Z]\d+)의 고양이 (\d+)마리가 ([A-Z]\d+)\(으\)로 담을 넘음$/);
      return m ? `담 넘기 ${m[1]}→${m[3]} ${m[2]}마리` : e.message;
    }
    case 'call': {
      // "닉네임: C4의 평상 명당을 부름 (방향을 바꿈), 그 칸 +1"
      const m = e.message.match(/: ([A-Z]\d+)의 (.+) 명당을 부름/);
      return m ? `${m[1]} ${m[2]} 부름` : e.message;
    }
    case 'pass':
      return '쉼';
    case 'flip': {
      // turn.ts 빼앗기 로그: "닉네임: 상대의 칸 2개를 빼앗음 (C5, D4)"
      const m = e.message.match(/^.*?: (.+)의 칸 (\d+)개를 빼앗음/);
      return m ? `${m[1]}의 칸 ${m[2]}개 빼앗음` : e.message;
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
  /** 이번 차례가 가져오기인지 놓기인지 */
  stage: string;
  items: Item[];
}

/**
 * 턴 전환 연출 (2026-10-01 사용자 지시: 턴과 턴 사이에 무슨 일이 있었는지 눈으로 보이게).
 * 차례가 넘어갈 때마다 "누구 차례" 스플래시와, 방금 끝난 차례에 일어난 사건(놓기·가져오기·빼앗기·버리기·기권)을
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
      stage: stageName(state.stage),
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
        <strong>
          {batch.mine ? '내 차례' : `${batch.name} 차례`} · {batch.stage}
        </strong>
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
