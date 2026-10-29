/**
 * Python AI 서비스(ai/, 포트 8000) HTTP 클라이언트.
 * 타임아웃·오류면 null 을 돌려준다. 응답 재검증과 자동 수(autoAction) 폴백은 AI 턴 실행기(game/aiTurn.ts) 한 곳에서 한다.
 */
import type { Action, GameState, PlayerId } from '@rootbound/shared';
import { maskState } from '@rootbound/shared';

const AI_BASE_URL = process.env.AI_BASE_URL ?? 'http://127.0.0.1:8000';
/** F027: AI는 2초 이내에 행동을 결정해야 한다 */
const AI_TIMEOUT_MS = 2000;

interface AiDecision {
  action: Action;
  depth: number;
  elapsedMs: number;
}

export async function checkAiHealth(): Promise<'ok' | 'down'> {
  try {
    const res = await fetch(`${AI_BASE_URL}/health`, { signal: AbortSignal.timeout(500) });
    return res.ok ? 'ok' : 'down';
  } catch {
    return 'down';
  }
}

export async function requestAiDecision(state: GameState, playerId: PlayerId): Promise<Action | null> {
  try {
    const res = await fetch(`${AI_BASE_URL}/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // AI 도 사람과 같은 정보만 본다: 자기 손만, 카드 더미·시드는 가린다
      body: JSON.stringify({ state: maskState(state, playerId), playerId, timeLimitMs: AI_TIMEOUT_MS }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS + 200),
    });
    if (!res.ok) {
      console.warn(`[ai] 응답 오류 ${res.status}`);
      return null;
    }
    const data = (await res.json()) as AiDecision;
    return data.action;
  } catch (err) {
    console.warn(`[ai] 호출 실패 (${(err as Error).message})`);
    return null;
  }
}
