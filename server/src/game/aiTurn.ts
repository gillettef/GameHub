/**
 * AI 턴 실행기 (F026, F027). 방 상태가 바뀔 때마다 `maybeRun(roomId)` 를 부르면,
 * 현재 턴이 AI 인 동안 Python AI 서비스에 결정을 요청해 룰 엔진으로 검증·적용하고 브로드캐스트한다.
 * 불법 액션·타임아웃·서비스 다운이면 PASS 로 폴백한다. 방마다 한 번에 하나만 돈다.
 */
import type { Action, GameState, PlayerId } from '@astraltab/shared';
import { requestAiDecision } from '../ai/client.js';
import { RoomManager, type Room } from '../rooms/manager.js';

export interface AiRunnerOptions {
  manager: RoomManager;
  /** 적용 후 저장·브로드캐스트 */
  onChange: (room: Room) => void;
  decide?: (state: GameState, playerId: PlayerId) => Promise<Action>;
  /** 사람이 AI 수를 눈으로 따라올 수 있게 두는 최소 지연 */
  thinkDelayMs?: number;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createAiRunner(opts: AiRunnerOptions) {
  const decide = opts.decide ?? requestAiDecision;
  const thinkDelayMs = opts.thinkDelayMs ?? 600;
  const running = new Set<string>();

  async function run(roomId: string): Promise<void> {
    for (;;) {
      const room = opts.manager.get(roomId);
      if (!room || !RoomManager.isAiTurn(room.state)) return;
      const state = room.state;
      const aiId = state.currentPlayerId as PlayerId;
      const turnBefore = state.turn;

      if (thinkDelayMs > 0) await delay(thinkDelayMs);
      const action = await decide(state, aiId);

      // 기다리는 사이 방이 사라졌거나 턴이 바뀌었으면(기권 등) 버린다
      const latest = opts.manager.get(roomId);
      if (!latest || latest.state.turn !== turnBefore || latest.state.currentPlayerId !== aiId) return;

      let result = opts.manager.tryApply(roomId, action.playerId === aiId ? action : { type: 'PASS', playerId: aiId });
      if (result.error) {
        console.warn(`[ai] room=${roomId} ${aiId} 불법 액션 (${result.error}) → PASS 폴백`);
        result = opts.manager.tryApply(roomId, { type: 'PASS', playerId: aiId });
        if (result.error) {
          console.error(`[ai] room=${roomId} ${aiId} PASS 도 거부됨: ${result.error}`);
          return;
        }
      }
      opts.onChange(result.room);
    }
  }

  return {
    /** 현재 턴이 AI 면 실행을 시작한다. 이미 돌고 있으면 무시 */
    maybeRun(roomId: string): void {
      if (running.has(roomId)) return;
      const room = opts.manager.get(roomId);
      if (!room || !RoomManager.isAiTurn(room.state)) return;
      running.add(roomId);
      run(roomId)
        .catch((err) => console.error(`[ai] room=${roomId} 실행 오류: ${(err as Error).message}`))
        .finally(() => running.delete(roomId));
    },
    isRunning(roomId: string): boolean {
      return running.has(roomId);
    },
  };
}
