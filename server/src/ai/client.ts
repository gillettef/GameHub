/**
 * Python AI 서비스(ai/, 포트 8000) HTTP 클라이언트.
 * AI 응답은 반드시 룰 엔진으로 재검증하고, 타임아웃·오류 시 엔진의 자동 수(autoAction)로 폴백한다.
 */
import type { Action, GameState, PlayerId } from '@rootbound/shared';
import { autoAction } from '@rootbound/shared';

const AI_BASE_URL = process.env.AI_BASE_URL ?? 'http://127.0.0.1:8000';
/** F027: AI는 2초 이내에 행동을 결정해야 한다 */
const AI_TIMEOUT_MS = 2000;

export interface AiDecision {
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
  const fallback = autoAction(state, playerId);
  try {
    const res = await fetch(`${AI_BASE_URL}/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state, playerId, timeLimitMs: AI_TIMEOUT_MS }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS + 200),
    });
    if (!res.ok) {
      console.warn(`[ai] 응답 오류 ${res.status}, 자동 수 폴백`);
      return fallback;
    }
    const data = (await res.json()) as AiDecision;
    return data.action;
  } catch (err) {
    console.warn(`[ai] 호출 실패 (${(err as Error).message}), 자동 수 폴백`);
    return fallback;
  }
}
