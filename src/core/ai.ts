// AI 결정: 후보 행동을 한 수 적용해 보고 평가 함수 증가량이 가장 큰 것을 고른다(결정적, 난수 없음)
import type { Action, GameState, PlayerState, RaidEffect, UnitKind } from './types';
import { BUILDING_KINDS, CHARTER_FIELDS, DOCTRINES, UNIT_KINDS } from './types';
import { BUILDING_COST, CARD_ROW_SIZE, PATRON_LIMIT, UNIT_COST, slotCost } from './data/constants';
import { CARD_DEFS } from './data/cards';
import { QUEST_DEFS } from './data/quests';
import { PATRON_DEFS } from './data/patrons';
import { MISSION_DEFS } from './data/missions';
import { applyAction } from './engine/turn';
import {
  buildingUnlocked,
  commandLeft,
  defenseLeft,
  defenseMax,
  defenseValue,
  mainDoctrine,
  meets,
  metric,
  might,
  playerMods,
  productionPreview,
  stage,
  unitUnlocked,
} from './engine/derive';
import { researchBlock, researchCost, webGraph, researchedCount, trunksAt } from './engine/research';
import { canTarget, raidWins } from './engine/external';
import { eraProgress } from './engine/era';
import { pendingChoices } from './engine/quest';

const THREAT_LEVEL = [0, 5, 9, 14, 14];

function remainingRounds(state: GameState): number {
  if (state.endTriggered) return 1;
  if (state.era >= 4) return 2;
  const { have, need } = eraProgress(state);
  const left = Math.max(0, 1 - have / need);
  return (3 - state.era) * 5 + 3 + left * 4;
}

/** 플레이어 한 명의 대략적 가치(문화 환산) */
export function evaluate(state: GameState, p: PlayerState): number {
  const R = remainingRounds(state);
  const resW = Math.min(1, R / 6);
  const mods = playerMods(p);
  const pv = productionPreview(p, mods);
  let v = p.res.culture;
  v += DOCTRINES.reduce((a, d) => a + p.doctrine[d] * 0.8, 0);
  v += (p.res.food * 0.3 + p.res.prod * 0.4 + Math.min(p.res.energy, 8) * 0.2 + p.res.sci * 0.5) * resW;
  v += R * (pv.gross.culture * 1 + pv.gross.sci * 0.6 + pv.gross.prod * 0.45 + pv.net.food * 0.35 + pv.gross.energy * 0.15);
  v += researchedCount(p) * 0.6 * Math.min(1, R / 4);
  const trunks = p.researched.filter((id) => id.startsWith('t:')).length;
  v += trunks * 2.5 * Math.min(1, R / 4);
  if (state.era <= 3) v += trunksAt(p, state.era) * 1.0 * Math.min(1, R / 4);
  const m = might(p, mods);
  const lvl = THREAT_LEVEL[state.era];
  v += Math.min(m, lvl) * 0.7 + Math.max(0, m - lvl) * 0.1;
  v += p.idle * 0.6 * Math.min(1, R / 4);
  for (const h of p.hand) {
    const c = CARD_DEFS[h.id];
    if (c.type === 'supply') {
      const g = c.instant.gain ?? {};
      const docs = Object.values(c.instant.doctrine ?? {}).reduce((a, b) => a + (b ?? 0), 0);
      v += 0.7 * ((g.culture ?? 0) + ((g.food ?? 0) + (g.prod ?? 0) + (g.sci ?? 0)) * 0.4 * resW + (g.energy ?? 0) * 0.2 * resW + docs * 0.8 + (c.instant.colonist ?? 0) * 0.6);
    }
  }
  if (p.legacyWip) {
    const c = CARD_DEFS[p.legacyWip.id];
    if (c.type === 'legacy') v += (p.legacyWip.done / c.stages.length) * c.points + 1;
  }
  for (const id of p.legacies) {
    const c = CARD_DEFS[id];
    if (c.type === 'legacy') v += c.points;
  }
  v += CHARTER_FIELDS.reduce((a, f) => a + p.charters[f] * 1.2 + (p.charters[f] >= 3 ? 4 : 0), 0);
  v += p.missionsDone.reduce((a, id) => a + (MISSION_DEFS[id]?.points ?? 0), 0);
  v += p.patrons.reduce((a, id) => a + (PATRON_DEFS[id]?.points ?? 0) + 1, 0);
  v += mods.sight * 0.4 * Math.min(1, R / 3);
  v += p.facilities.length * 1;
  return v;
}

/** 대기 결정에 대한 AI 응답 */
export function aiRespond(state: GameState): number {
  const pd = state.pending[0];
  const p = state.players[pd.player];
  switch (pd.kind) {
    case 'mission': {
      // 달성 가능성이 가장 낮아 보이는 임무를 버린다
      let worst = 0;
      let worstScore = Infinity;
      pd.options.forEach((id, i) => {
        const m = MISSION_DEFS[id];
        const ratio = m.cond.reduce((a, c) => a + Math.min(1, metric(state, p, c.metric) / c.min), 0) / m.cond.length;
        if (ratio < worstScore) {
          worstScore = ratio;
          worst = i;
        }
      });
      return worst;
    }
    case 'questReward': {
      const q = QUEST_DEFS[pd.questId];
      if (q.kind !== 'judge' && q.kind !== 'contest') return 0;
      const main = mainDoctrine(p) ?? DOCTRINES.reduce((a, b) => (p.doctrine[b] > p.doctrine[a] ? b : a));
      let best = 0;
      let bestV = -Infinity;
      q.options.forEach((o, i) => {
        const g = o.gain ?? {};
        const v = (o.doctrine === main ? 2 : 0) + o.points + (g.culture ?? 0) + ((g.food ?? 0) + (g.prod ?? 0) + (g.sci ?? 0)) * 0.4 + (g.energy ?? 0) * 0.2;
        if (v > bestV) {
          bestV = v;
          best = i;
        }
      });
      return best;
    }
    case 'redirect': {
      const q = QUEST_DEFS[pd.questId];
      if (q.kind !== 'threat' || defenseValue(p) >= q.power) return 0;
      let best = 0;
      let low = Infinity;
      pd.targets.forEach((t, i) => {
        const d = defenseValue(state.players[t]);
        if (d < low) {
          low = d;
          best = i + 1;
        }
      });
      return best;
    }
    case 'coexist':
      return 1;
    case 'patron': {
      const def = PATRON_DEFS[pd.patronId];
      if (p.patrons.length < PATRON_LIMIT) return 1;
      let worst = -1;
      let worstPts = def.points;
      p.patrons.forEach((id, i) => {
        if (PATRON_DEFS[id].points < worstPts) {
          worstPts = PATRON_DEFS[id].points;
          worst = i;
        }
      });
      return worst >= 0 ? 2 + worst : 0;
    }
  }
}

/** 행동을 적용하고 이어지는 대기 결정을 AI 응답으로 모두 처리한다 */
function simulate(state: GameState, pid: number, a: Action): GameState | null {
  let r = applyAction(state, pid, a);
  if (r.error) return null;
  let s = r.state;
  let guard = 0;
  while (s.pending.length && guard++ < 20) {
    const choice = aiRespond(s);
    r = applyAction(s, s.pending[0].player, { type: 'respond', choice });
    if (r.error) break;
    s = r.state;
  }
  return s;
}

function candidates(state: GameState, p: PlayerState): Action[] {
  const out: Action[] = [];
  const cmd = commandLeft(state, p);
  const def = defenseLeft(p);
  if (cmd > 0) {
    const { nodes } = webGraph(state.layout);
    const mods = playerMods(p);
    for (const id of Object.keys(nodes)) {
      if (!researchBlock(state, p, id) && researchCost(state, p, id, mods) <= p.res.sci) out.push({ type: 'research', node: id });
    }
    for (let slot = 0; slot < CARD_ROW_SIZE; slot++) if (state.cardRow[slot]) out.push({ type: 'takeCard', slot });
    p.hand.forEach((h, index) => !h.fresh && out.push({ type: 'useSupply', index }));
    for (const k of BUILDING_KINDS) {
      if (p.idle > 0) {
        for (let lvl = 3; lvl >= 0; lvl--) {
          if (buildingUnlocked(p, k, lvl) && BUILDING_COST[lvl] <= p.res.prod) {
            out.push({ type: 'build', kind: k, level: lvl });
            break;
          }
        }
      }
      let top = 0;
      for (let lvl = 3; lvl >= 1; lvl--) if (buildingUnlocked(p, k, lvl)) { top = lvl; break; }
      for (let from = 0; from < top; from++) {
        if (p.buildings[k][from] > 0) {
          out.push({ type: 'upgrade', kind: k, from, to: top });
          break;
        }
      }
    }
    if (p.pool > 0) out.push({ type: 'addColonist' });
    if (p.legacyWip) out.push({ type: 'legacyStage' });
    state.satMarket.forEach((id, slot) => {
      if (id) out.push(p.orbit.length >= 2 ? { type: 'launch', slot, replace: p.orbit[0].timer <= p.orbit[1].timer ? 0 : 1 } : { type: 'launch', slot });
    });
    for (const f of CHARTER_FIELDS) out.push({ type: 'charter', field: f });
    state.questSlots.forEach((id, slot) => {
      const q = id ? QUEST_DEFS[id] : null;
      if (q?.kind === 'contest' && meets(state, p, q.cond)) q.options.forEach((_, option) => out.push({ type: 'doQuest', slot, option }));
    });
  }
  if (def > 0) {
    for (const k of UNIT_KINDS as UnitKind[]) {
      if (p.idle > 0) {
        for (let lvl = 3; lvl >= 0; lvl--) {
          const c = UNIT_COST[k][lvl];
          if (c != null && unitUnlocked(p, k, lvl) && c <= p.res.prod) {
            out.push({ type: 'buildUnit', kind: k, level: lvl });
            break;
          }
        }
      }
      let top = -1;
      for (let lvl = 3; lvl >= 0; lvl--) if (unitUnlocked(p, k, lvl)) { top = lvl; break; }
      for (let from = 0; from < top; from++) {
        if (p.units[k][from] > 0) {
          out.push({ type: 'upgradeUnit', kind: k, from, to: top });
          break;
        }
      }
    }
  }
  return out;
}

function commandCost(a: Action): number {
  return a.type === 'takeCard' ? slotCost(a.slot) : 1;
}

/** 대외 단계 후보 */
function externalChoice(state: GameState, p: PlayerState, base: number): { action: Action; score: number } | null {
  let best: { action: Action; score: number } | null = null;
  const consider = (action: Action, extra = 0) => {
    const s = simulate(state, p.id, action);
    if (!s) return;
    const sp = s.players[p.id];
    let score = evaluate(s, sp) - base + extra;
    if (action.type === 'raid') {
      const t = action.target;
      score += (evaluate(state, state.players[t]) - evaluate(s, s.players[t])) * 0.3;
    }
    if (!best || score > best.score) best = { action, score };
  };
  const def = defenseLeft(p);
  if (def >= 2) {
    for (const t of state.players) {
      if (canTarget(state, p, t.id)) continue;
      const swarm = stage(p, 'symbiont') >= 2;
      if (swarm && raidWins(state, p, t.id, true)) consider({ type: 'raid', target: t.id, effect: 'lootProd', swarm: true });
      if (raidWins(state, p, t.id, false)) {
        const effects: RaidEffect[] = ['lootProd', 'lootFood', 'stealSci', 'stealEnergy'];
        if (stage(p, 'ark') >= 2) effects.push('abduct');
        for (const e of effects) consider({ type: 'raid', target: t.id, effect: e }, -0.5);
      }
    }
  }
  if (def >= 1 && state.questSlots[0]) consider({ type: 'pullTrack' }, -0.8);
  if (state.era >= 2 && !p.conflict && defenseMax(p) >= 3) {
    for (const t of state.players) {
      if (canTarget(state, p, t.id)) continue;
      const margin = might(p) - defenseValue(t);
      if (margin >= 4) {
        const loss = t.res.culture >= 6 ? 'culture' : 'building';
        const score = margin * 0.6;
        if (!best || score > best.score) best = { action: { type: 'declareConflict', target: t.id, loss }, score };
      }
    }
  }
  return best;
}

/** AI 의 다음 행동. 대기 결정이 자기 것이면 응답, 자기 차례면 행동 */
export function chooseAction(state: GameState, pid: number): Action | null {
  if (state.gameOver) return null;
  if (state.pending.length) {
    if (state.pending[0].player !== pid) return null;
    const n = pendingChoices(state);
    return { type: 'respond', choice: Math.min(aiRespond(state), Math.max(0, n - 1)) };
  }
  if (state.current !== pid) return null;
  const lean: GameState = { ...state, log: [] };
  const p = lean.players[pid];
  const base = evaluate(lean, p);
  let best: { action: Action; score: number } | null = null;
  if (lean.phase === 'external') {
    const ext = externalChoice(lean, p, base);
    if (ext && ext.score > 0.5) return ext.action;
  }
  for (const a of candidates(lean, p)) {
    const s = simulate(lean, pid, a);
    if (!s) continue;
    const score = (evaluate(s, s.players[pid]) - base) / commandCost(a);
    if (!best || score > best.score) best = { action: a, score };
  }
  if (best && best.score > 0.15) return best.action;
  return { type: 'endTurn' };
}

