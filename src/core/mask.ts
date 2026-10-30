// 비공개 정보 가림: 다른 사람의 임무, 덱 순서, 본인 시야 밖의 미래 퀘스트, 공통 종료 퀘스트, 시드
import type { GameState, Ring } from './types';
import { QUEST_DEFS } from './data/quests';
import { playerMods } from './engine/derive';
import { clone } from './engine/util';

export const HIDDEN = '?';

const hideAll = (ids: string[]) => ids.map(() => HIDDEN);

/** viewer 에게 보낼 상태. viewer = null 이면 관전자(모든 비공개 가림) */
export function maskFor(state: GameState, viewer: number | null): GameState {
  const s = clone(state);
  s.seed = 0;
  s.rngState = 0;
  for (const p of s.players) {
    if (p.id !== viewer) p.missions = hideAll(p.missions);
  }
  s.pending = s.pending.map((pd) => (pd.kind === 'mission' && pd.player !== viewer ? { ...pd, options: hideAll(pd.options) } : pd));
  for (const r of [1, 2, 3] as Ring[]) {
    s.cardDecks[r] = hideAll(s.cardDecks[r]);
    s.questDecks[r] = hideAll(s.questDecks[r]);
    s.patronDecks[r] = hideAll(s.patronDecks[r]);
  }
  s.satDeck = hideAll(s.satDeck);
  s.missionDeck = hideAll(s.missionDeck);
  const sight = viewer === null ? 0 : playerMods(state.players[viewer]).sight;
  s.questFuture = s.questFuture.map((id, i) => (i < sight ? id : HIDDEN));
  if (!s.gameOver) s.endBundle = s.endBundle.map((id) => (QUEST_DEFS[id]?.kind === 'fruition' ? id : HIDDEN));
  return s;
}
