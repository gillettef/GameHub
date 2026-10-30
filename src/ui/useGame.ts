// 게임 화면 공용 훅: 상태·내 자리·행동 전송·사전 검증
import { applyAction } from '../core/engine/turn';
import type { Action } from '../core/types';
import { useApp } from '../store/app';

export function useGame() {
  const game = useApp((s) => s.game)!;
  const me = useApp((s) => s.me);
  const send = useApp((s) => s.send);
  const myTurn = !game.gameOver && !game.pending.length && game.current === me;
  /** 행동이 불가능하면 사유, 가능하면 null */
  const lean = { ...game, log: [] };
  const check = (a: Action): string | null => (myTurn ? (applyAction(lean, me, a).error ?? null) : '내 차례가 아닙니다');
  const act = (a: Action) => send?.(a);
  return { game, me, myTurn, check, act };
}
