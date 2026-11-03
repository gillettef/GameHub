// 게임 화면 공용 훅: 상태·내 자리·행동 전송·사전 검증
import { applyAction } from '../core/engine/turn';
import { CARD_DEFS } from '../core/data/cards';
import type { Action, GameState } from '../core/types';
import { useApp } from '../store/app';

/** 대외 단계에서 이 행동을 하면 습격·분쟁 기회가 넘어간다(엔진이 주요 행동 뒤 phase 를 actions 로 바꾼다) */
const SKIPS_EXTERNAL: Action['type'][] = ['research', 'useSupply', 'build', 'upgrade', 'buildUnit', 'upgradeUnit', 'disband', 'addColonist', 'legacyStage', 'launch', 'charter'];

/** 지금 실제로 낼 수 있는 습격·분쟁이 있는가 */
export function externalAvailable(game: GameState, me: number, check: (a: Action) => string | null): boolean {
  const p = game.players[me];
  return p.hand.some((h, card) => {
    const def = CARD_DEFS[h.id];
    if (!def || h.fresh) return false;
    return game.players.some((t) => {
      if (t.id === me) return false;
      if (def.type === 'raid') return !check({ type: 'raid', card, target: t.id, effect: def.effects[0] });
      if (def.type === 'conflict') return !check({ type: 'declareConflict', card, target: t.id });
      return false;
    });
  });
}

export function useGame() {
  const game = useApp((s) => s.game)!;
  const me = useApp((s) => s.me);
  const send = useApp((s) => s.send);
  const mode = useApp((s) => s.mode);
  const conn = useApp((s) => s.conn);
  /** 온라인인데 서버와 끊긴 동안은 행동을 보낼 수 없다 */
  const offline = mode === 'online' && conn !== 'open';
  const myTurn = !game.gameOver && !game.pending.length && game.current === me;
  /** 행동이 불가능하면 사유, 가능하면 null */
  const lean = { ...game, log: [] };
  const rawCheck = (a: Action): string | null => (myTurn ? (applyAction(lean, me, a).error ?? null) : '내 차례가 아닙니다');
  const check = (a: Action): string | null => (offline ? '연결이 끊겼습니다 — 다시 연결하는 중' : rawCheck(a));
  const act = (a: Action) => {
    const app = useApp.getState();
    if (offline) {
      app.showToast('연결이 끊겨 보낼 수 없습니다 — 다시 연결하는 중');
      return;
    }
    // 대외 단계에서 습격·분쟁을 낼 수 있는데 주요 행동을 먼저 하면 기회가 넘어간다 — 한 번 묻는다
    if (myTurn && game.phase === 'external' && SKIPS_EXTERNAL.includes(a.type) && externalAvailable(game, me, rawCheck)) {
      app.set({
        confirm: {
          title: '습격 기회를 넘깁니다',
          text: '습격·분쟁은 차례마다 다른 행동보다 먼저만 낼 수 있습니다. 이 행동을 하면 이번 차례의 습격·분쟁 기회가 사라집니다.',
          ok: '넘기고 진행',
          onOk: () => useApp.getState().send?.(a),
        },
      });
      return;
    }
    send?.(a);
  };
  return { game, me, myTurn, offline, check, act };
}
