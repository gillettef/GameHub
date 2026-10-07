/**
 * AI 턴 실행기 (F026, F027). 방 상태가 바뀔 때마다 `maybeRun(roomId)` 를 부르면,
 * 현재 턴이 AI 인 동안 (또는 시간 초과로 AI 대리 중인 사람 좌석, Rules.md 5.4) Python AI 서비스에 결정을 요청해 룰 엔진으로 검증·적용하고 브로드캐스트한다.
 * 불법 액션·타임아웃·서비스 다운이면 엔진의 자동 수(autoAction)로 폴백한다. 방마다 한 번에 하나만 돈다.
 */
import type { Action, GameState, PlayerId } from '@rootbound/shared';
import { autoAction } from '@rootbound/shared';
import { actionShapeError } from '../rooms/manager.js';
import { requestAiDecision } from '../ai/client.js';
import type { RoomManager, Room } from '../rooms/manager.js';

export interface AiRunnerOptions {
  manager: RoomManager;
  /** 적용 후 저장·브로드캐스트 */
  onChange: (room: Room) => void;
  decide?: (state: GameState, playerId: PlayerId) => Promise<Action | null>;
  /** 사람이 AI 수를 눈으로 따라올 수 있게 두는 최소 지연 */
  thinkDelayMs?: number;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createAiRunner(opts: AiRunnerOptions) {
  const decide = opts.decide ?? requestAiDecision;
  const thinkDelayMs = opts.thinkDelayMs ?? 600;
  const running = new Set<string>();

  /** 적용 중 예외가 나도 run 을 끊지 않고 오류로 돌려준다 */
  function safeApply(roomId: string, action: Action, room: Room): { room: Room; error?: string } {
    try {
      return opts.manager.tryApply(roomId, action);
    } catch (err) {
      return { room, error: `적용 중 예외: ${(err as Error).message}` };
    }
  }

  async function run(roomId: string): Promise<void> {
    for (;;) {
      const room = opts.manager.get(roomId);
      if (!room || !opts.manager.isAutoTurn(room)) return;
      const state = room.state;
      const aiId = state.currentPlayerId as PlayerId;
      // 드래프트 중에는 turn 이 0 이고 뱀 순서로 같은 좌석이 연달아 고르므로 단계·차례·픽 번호를 함께 본다
      const keyOf = (st: GameState) => `${st.phase}:${st.turn}:${st.draftIndex}`;
      const keyBefore = keyOf(state);

      if (thinkDelayMs > 0) await delay(thinkDelayMs);
      const action = await decide(state, aiId);

      // 기다리는 사이 방이 사라졌거나 턴이 바뀌었거나(기권, 대리 좌석 사람이 직접 PASS 등) 사람이 좌석을
      // 되찾았으면 이 결정은 버린다. 그래도 지금 턴이 다른 AI 좌석일 수 있으므로 멈추지 않고 처음부터 다시 본다
      // (이 run 이 도는 동안 commit 의 maybeRun 은 무시되었기 때문)
      const latest = opts.manager.get(roomId);
      if (!latest) return;
      if (keyOf(latest.state) !== keyBefore || latest.state.currentPlayerId !== aiId || !opts.manager.isAutoTurn(latest)) continue;

      const fallback = () => autoAction(opts.manager.get(roomId)!.state, aiId);
      // AI 응답도 사람 액션처럼 모양부터 검사한다(모양이 깨진 액션이 엔진에서 예외를 내면 이 좌석이 멈춘다)
      let result = action && action.playerId === aiId && !actionShapeError(action) ? safeApply(roomId, action, latest) : { room: latest, error: 'AI 응답이 없거나 모양이 잘못됨' };
      if (result.error) {
        console.warn(`[ai] room=${roomId} ${aiId} 불법 액션 (${result.error}) → 자동 수 폴백`);
        const auto = fallback();
        result = auto ? safeApply(roomId, auto, latest) : { room: latest, error: '자동 수 없음' };
        if (result.error) {
          console.error(`[ai] room=${roomId} ${aiId} 자동 수도 거부됨: ${result.error}`);
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
      if (!room || !opts.manager.isAutoTurn(room)) return;
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
