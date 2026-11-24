// 최종 점수 (Rules.md 15절)
import type { Doctrine, GameState, PlayerState } from '../types';
import { CHARTER_FIELDS, DOCTRINES, RES_KEYS } from '../types';
import { CHARTER_FULL_POINTS, FRUITION_FIRST, FRUITION_OTHER, FRUITION_PER_STAGE } from '../data/constants';
import { CARD_DEFS } from '../data/cards';
import { PATRON_DEFS } from '../data/patrons';
import { QUEST_DEFS } from '../data/quests';
import { metric, stage } from './derive';

export interface ScoreBreakdown {
  player: number;
  culture: number;
  legacies: number;
  charters: number;
  patrons: number;
  fruition: number;
  finale: number;
  total: number;
}

export function fruitionScore(state: GameState, p: PlayerState, d: Doctrine): number {
  let n = stage(p, d) * FRUITION_PER_STAGE;
  const idx = state.stage4Order[d].indexOf(p.id);
  if (idx === 0) n += FRUITION_FIRST;
  else if (idx > 0) n += FRUITION_OTHER;
  return n;
}

export function scorePlayer(state: GameState, p: PlayerState): ScoreBreakdown {
  const legacies = p.legacies.reduce((a, id) => {
    const c = CARD_DEFS[id];
    return a + (c?.type === 'legacy' ? c.points : 0);
  }, 0);
  const charters = CHARTER_FIELDS.filter((f) => p.charters[f] >= 3).length * CHARTER_FULL_POINTS;
  const patrons = p.patrons.reduce((a, id) => a + (PATRON_DEFS[id]?.points ?? 0), 0);
  let fruition = 0;
  let finale = 0;
  for (const id of state.endBundle) {
    const q = QUEST_DEFS[id];
    if (q?.kind === 'fruition') fruition += fruitionScore(state, p, q.doctrine);
    else if (q?.kind === 'finale') finale += Math.floor(metric(state, p, q.metric) / q.divisor);
  }
  const culture = p.res.culture;
  return { player: p.id, culture, legacies, charters, patrons, fruition, finale, total: culture + legacies + charters + patrons + fruition + finale };
}

/** 순위(동점: 노선 단계 합 → 남은 자원 합 → 자리 늦은 쪽) */
export function ranking(state: GameState): ScoreBreakdown[] {
  const seat = (id: number) => (id - state.startPlayer + state.players.length) % state.players.length;
  const tie = (p: PlayerState) => [DOCTRINES.reduce((a, d) => a + stage(p, d), 0), RES_KEYS.reduce((a, k) => a + p.res[k], 0), seat(p.id)];
  return state.players
    .map((p) => ({ s: scorePlayer(state, p), t: tie(p) }))
    .sort((a, b) => b.s.total - a.s.total || b.t[0] - a.t[0] || b.t[1] - a.t[1] || b.t[2] - a.t[2])
    .map((x) => x.s);
}
