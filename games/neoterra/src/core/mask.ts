// 비공개 정보 가림: 덱 순서, 퀘스트 트랙의 본인 시야 밖 뒷면 카드, 공통 종료 퀘스트, 시드, 다른 사람의 손패와 비공개 기록
import type { GameState } from './types';
import { QUEST_DEFS } from './data/quests';
import { slotVisible } from './engine/quest';
import { clone } from './engine/util';

export const HIDDEN = '?';
export const LOG_SEND = 200;

const hideAll = (ids: string[]) => ids.map(() => HIDDEN);

/** viewer 에게 보낼 상태. viewer = null 이면 관전자(모든 비공개 가림) */
export function maskFor(state: GameState, viewer: number | null): GameState {
  // 기록은 최근 것만 보낸다(전송량 제한). 깊은 복사 전에 잘라 긴 판에서도 가볍게
  const s = clone(state.log.length > LOG_SEND ? { ...state, log: state.log.slice(-LOG_SEND) } : state);
  s.seed = 0;
  s.rngState = [0, 0, 0, 0];
  // 비공개 기록: 본인 것은 본문, 다른 사람 것은 공개 문구로 바꾼다
  s.log = s.log.map((e) => (e.pub === undefined ? e : { round: e.round, player: e.player, text: viewer === e.player || s.gameOver ? e.text : e.pub }));
  // 다른 사람의 손패는 장수와 '가져온 차례' 표시만 남긴다(게임이 끝나면 공개)
  if (!s.gameOver) for (const p of s.players) if (p.id !== viewer) p.hand = p.hand.map((h) => ({ id: HIDDEN, fresh: h.fresh }));
  for (const r of [1, 2, 3, 4] as const) s.questDecks[r] = hideAll(s.questDecks[r]);
  for (const r of [1, 2, 3] as const) s.patronDecks[r] = hideAll(s.patronDecks[r]);
  s.satDeck = hideAll(s.satDeck);
  if (!s.gameOver) s.questRow = s.questRow.map((id, i) => (slotVisible(state, viewer, i) ? id : HIDDEN));
  if (!s.gameOver) s.endBundle = s.endBundle.map((id) => (QUEST_DEFS[id]?.kind === 'fruition' ? id : HIDDEN));
  return s;
}
