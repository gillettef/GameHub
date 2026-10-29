/**
 * 핫시트 구동: 엔진 결과를 스토어에 반영하고, 튜토리얼 봇 자리 차례면 잠시 뒤 한 수를 둔다.
 * 스토어를 직접 import 하지 않고 gameStore 가 넘겨준 접근자로만 읽고 쓴다(순환 import 방지).
 */
import type { GameState } from '@rootbound/shared';
import { maskState } from '@rootbound/shared';
import { asState } from '../game/derived';
import { tutorialBotAction } from '../game/tutorialBot';
import type { GameStore } from './gameStore';

const BOT_DELAY_MS = 900;

interface StoreAccess {
  getState: () => GameStore;
  setState: (partial: Partial<GameStore>) => void;
}

export interface HotseatDriver {
  commit: (result: { state: GameState; error?: string }) => void;
  scheduleBot: () => void;
  cancelBot: () => void;
}

/** store: 스토어 접근자(늦게 읽는다). clearSelection: 차례가 바뀔 때 비우는 선택 상태(gameStore 의 CLEAR_SELECTION) */
export function createHotseatDriver(store: () => StoreAccess, clearSelection: Partial<GameStore>): HotseatDriver {
  let botTimer: number | null = null;

  /**
   * 엔진 결과를 화면에 반영한다. 봇이 있으면(튜토리얼) 화면 주인은 그대로, 없으면 차례인 사람이 화면을 본다.
   * 진행 중에 보는 사람이 바뀌면(가져오기 → 다음 사람, 가져오기 → 심기 포함) 손패를 가려야 하므로 기기 넘김.
   * 공개 단계에는 차례가 없으므로 넘기지 않는다
   */
  function commit(result: { state: GameState; error?: string }): void {
    if (result.error) {
      store().setState({ notice: result.error });
      return;
    }
    const next = result.state;
    const { botIds, viewerId } = store().getState();
    const botTurn = next.currentPlayerId !== null && botIds.includes(next.currentPlayerId) && next.phase === 'playing';
    const nextViewer = botIds.length > 0 ? viewerId : (next.currentPlayerId ?? viewerId);
    const handoff = botIds.length === 0 && next.phase === 'playing' && nextViewer !== viewerId;
    store().setState({ state: maskState(next, null), viewerId: nextViewer, ...clearSelection, notice: null, cardModal: null, handoffPending: handoff });
    if (botTurn) scheduleBot();
  }

  /** 봇 자리 차례면 잠시 뒤 한 수를 둔다 */
  function scheduleBot(): void {
    if (botTimer !== null) window.clearTimeout(botTimer);
    botTimer = window.setTimeout(() => {
      botTimer = null;
      const { state, botIds, dispatch } = store().getState();
      const cur = state?.currentPlayerId;
      if (!state || !cur || !botIds.includes(cur) || state.phase !== 'playing') return;
      const action = tutorialBotAction(asState(state), cur);
      if (action) dispatch(action);
    }, BOT_DELAY_MS);
  }

  function cancelBot(): void {
    if (botTimer !== null) window.clearTimeout(botTimer);
    botTimer = null;
  }

  return { commit, scheduleBot, cancelBot };
}
