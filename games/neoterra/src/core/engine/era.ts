// 시대 전환 (Rules.md 4절)
import type { Era, GameState } from '../types';
import { END_KEEP_ROW, ERA_MAX_ROUNDS, ERA_TRUNK_PER_PLAYER, QUEST_ROW_SIZE } from '../data/constants';
import { trunksAt } from './research';
import { checkPatronDemands, refillRow } from './quest';
import { log, withRng } from './util';

export function eraProgress(state: GameState): { have: number; need: number } {
  const ring = Math.min(state.era, 3);
  const have = state.players.reduce((a, p) => a + trunksAt(p, ring), 0);
  return { have, need: Math.ceil(state.players.length * ERA_TRUNK_PER_PLAYER[ring]) };
}

/** 현재 시대 퀘스트 덱이 바닥나 트랙을 다 채우지 못하는 상태(4.2 덱 소진) */
export function deckExhausted(state: GameState): boolean {
  return state.era <= 3 && state.questDecks[state.era].length === 0 && state.questDiscard.length === 0 && state.questRow.length < QUEST_ROW_SIZE;
}

/** 테크 기준·덱 소진은 매 차례 끝, 라운드 상한 안전장치는 라운드 끝에서만 본다 */
export function eraShouldAdvance(state: GameState, roundEnd: boolean): boolean {
  if (state.era >= 4) return false;
  const { have, need } = eraProgress(state);
  return have >= need || deckExhausted(state) || (roundEnd && state.round - state.eraStartRound >= ERA_MAX_ROUNDS);
}

/** 시대 전환(4.3): 주둔지 요구 → 퀘스트 트랙 교체 */
export function advanceEra(state: GameState): void {
  const old = state.era;
  const next = (old + 1) as Era;
  checkPatronDemands(state, old);
  state.eraStartRound = state.round;
  state.era = next;
  state.questRow = [];
  state.questOpen = [];
  state.questDiscard = [];
  state.turnFront = null;
  if (next <= 3) {
    refillRow(state);
  } else {
    // 종료 시대(12.6): 남은 3시대 덱 위 5장 → 그 뒤는 섞은 종료 묶음
    const keep = state.questDecks[3].splice(0, END_KEEP_ROW);
    state.questDecks[3] = [];
    state.questDecks[4] = withRng(state, (rng) => rng.shuffle(state.endBundle));
    state.questRow = keep;
    state.questOpen = keep.map(() => false);
    refillRow(state);
  }
  log(state, null, next <= 3 ? `${next}시대 시작` : '종료 시대 시작 — 결실 퀘스트가 다가옵니다');
}
