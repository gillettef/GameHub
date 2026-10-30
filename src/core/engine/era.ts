// 시대 전환 (Rules.md 4절)
import type { Era, GameState, Ring } from '../types';
import { CARD_ROW_SIZE, END_KEEP_FUTURE, ERA_MAX_ROUNDS, ERA_TRUNK_PER_PLAYER } from '../data/constants';
import { QUEST_DEFS } from '../data/quests';
import { trunksAt } from './research';
import { checkPatronDemands, fillSlots, processQuest } from './quest';
import { log, withRng } from './util';

export function eraProgress(state: GameState): { have: number; need: number } {
  const ring = Math.min(state.era, 3);
  const have = state.players.reduce((a, p) => a + trunksAt(p, ring), 0);
  return { have, need: state.players.length * ERA_TRUNK_PER_PLAYER };
}

/** 테크 기준은 매 차례 끝, 라운드 상한 안전장치는 라운드 끝에서만 본다 */
export function eraShouldAdvance(state: GameState, roundEnd: boolean): boolean {
  if (state.era >= 4) return false;
  const { have, need } = eraProgress(state);
  return have >= need || (roundEnd && state.round - state.eraStartRound >= ERA_MAX_ROUNDS);
}

/** 시대 전환 1단계: 공개 칸의 위협형만 처리(대상별 단계로 큐에), 나머지는 버림. 2단계 이후는 eraRest 단계로 */
export function advanceEraStart(state: GameState): void {
  const old = state.era;
  const threats: string[] = [];
  for (let i = 0; i < state.questSlots.length; i++) {
    const id = state.questSlots[i];
    state.questSlots[i] = null;
    if (id && QUEST_DEFS[id]?.kind === 'threat') threats.push(id);
  }
  state.steps.unshift({ k: 'eraRest', old });
  for (const id of threats.reverse()) processQuest(state, id, state.current);
}

/** 시대 전환 2~5단계: 후원 계약 요구 → 카드 줄 → 퀘스트 트랙 */
export function advanceEraRest(state: GameState, old: number): void {
  const next = (old + 1) as Era;
  // 2. 후원 계약 요구
  checkPatronDemands(state, old);
  // 3. 카드 줄 교체
  if (next <= 3) {
    const ring = next as Ring;
    const oldRing = old as Ring;
    for (const c of state.cardRow) if (c) state.cardDiscard[oldRing].push(c);
    state.cardRow = state.cardDecks[ring].splice(0, CARD_ROW_SIZE);
    while (state.cardRow.length < CARD_ROW_SIZE) state.cardRow.push(null);
  }
  state.eraStartRound = state.round;
  // 4. 퀘스트 트랙 교체
  if (next <= 3) {
    state.questFuture = state.questDecks[next as Ring].splice(0);
  } else {
    const keep = state.questFuture.slice(0, END_KEEP_FUTURE);
    const bundle = withRng(state, (rng) => rng.shuffle(state.endBundle));
    // 공개 칸은 남긴 3시대 카드로만 채운다 — 결실 퀘스트는 트랙 진행으로만 들어온다
    state.questSlots = [keep[0] ?? null, keep[1] ?? null];
    state.questFuture = [...keep.slice(2), ...bundle];
  }
  state.era = next;
  if (next <= 3) fillSlots(state);
  log(state, null, next <= 3 ? `${next}시대 시작` : '종료 시대 시작 — 결실 퀘스트가 다가옵니다');
}
