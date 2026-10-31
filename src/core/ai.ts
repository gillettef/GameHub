// AI 결정: 후보 행동을 한 수 적용해 보고 평가 함수 증가량이 가장 큰 것을 고른다(결정적, 난수 없음)
import type { Action, GameState, PlayerState, RaidEffect, UnitKind } from './types';
import { BUILDING_KINDS, CHARTER_FIELDS, DOCTRINES, UNIT_KINDS } from './types';
import { BUILDING_COST, CONFLICT_DEFENSE, PATRON_LIMIT, RAID_DEFENSE, TRUNK_BASE_COST, UNIT_COST } from './data/constants';
import { CARD_DEFS } from './data/cards';
import { QUEST_DEFS } from './data/quests';
import { PATRON_DEFS } from './data/patrons';
import { applyAction } from './engine/turn';
import {
  attackValue,
  buildingUnlocked,
  commandLeft,
  defenseLeft,
  defenseMax,
  defenseValue,
  mainDoctrine,
  might,
  plague,
  playerMods,
  productionPreview,
  unhealthy,
  stage,
  unitUnlocked,
} from './engine/derive';
import { researchBlock, researchCost, webGraph, researchedCount, trunksAt } from './engine/research';
import { canTarget, raidWins } from './engine/external';
import { pendingChoices, pickBlock, slotVisible } from './engine/quest';
import { maskFor } from './mask';

const THREAT_LEVEL = [0, 5, 9, 14, 14];
/** 뒷면 카드를 모른 채 고를 때 기대 가치(임시). 덱 평균을 엿보지 않고 상수로 둔다 */
const BLIND_PICK_VALUE = 1.5;
/** 상대에게 준 손해를 내 이득으로 셈하는 비율 */
const HARM_WEIGHT = 0.3;

/** 쌓아 둔 자원은 쓸 곳이 한정돼 있으니 일정량을 넘으면 가치를 크게 깎는다(쌓아 두기만 하는 착시 방지) */
const STOCK_SOFT_CAP = { food: 8, prod: 10, sci: 10 };
const soft = (x: number, cap: number) => Math.min(x, cap) + Math.max(0, x - cap) * 0.15;

function remainingRounds(state: GameState): number {
  if (state.endTriggered) return 1;
  if (state.era >= 4) return 2;
  // 시대 진행도(줄기 합)에 묶으면 내 줄기 연구가 "남은 판을 줄이는" 손해로 보여 연구를 미룬다 — 라운드만으로 추정한다
  const inEra = state.round - state.eraStartRound;
  return (3 - state.era) * 6 + Math.max(1, 6 - inEra) + 2;
}

/** 플레이어 한 명의 대략적 가치(문화 환산) */
export function evaluate(state: GameState, p: PlayerState): number {
  const R = remainingRounds(state);
  const resW = Math.min(1, R / 6);
  const mods = playerMods(p);
  const pv = productionPreview(p, mods);
  let v = p.res.culture;
  v += DOCTRINES.reduce((a, d) => a + p.doctrine[d] * 0.8, 0);
  v += (soft(p.res.food, STOCK_SOFT_CAP.food) * 0.3 + soft(p.res.prod, STOCK_SOFT_CAP.prod) * 0.4 + Math.min(p.res.energy, 8) * 0.2 + soft(p.res.sci, STOCK_SOFT_CAP.sci) * 0.5) * resW;
  v += R * (pv.gross.culture * 1 + pv.gross.sci * 0.6 + pv.gross.prod * 0.45 + pv.net.food * 0.35 + pv.gross.energy * 0.15);
  v += researchedCount(p) * 0.6 * Math.min(1, R / 4);
  // 줄기는 높은 고리일수록 큰 건물·유닛 레벨을 연다 — 기본 비용에 비례해 평가(고리 2·3 줄기를 미루는 착시 방지)
  const trunkValue = [1, 2, 3].reduce((a, r) => a + trunksAt(p, r) * TRUNK_BASE_COST[r], 0);
  v += trunkValue * Math.min(1, R / 4);
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
    } else if (c.type === 'raid') {
      // 쓸 기회가 남아 있어야 가치가 있다. 쓰는 이득보다 작게 잡아 손에 묵히지 않게 한다
      v += (0.5 + c.atk * 0.1) * Math.min(1, R / 3);
    } else if (c.type === 'conflict') {
      v += (0.8 + c.atk * 0.1) * Math.min(1, R / 3);
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
      // 공존은 건강 −1: 불건강이 유휴보다 많아지면 역병이니 처치를 고른다
      return unhealthy(p) + 1 > p.idle ? 0 : 1;
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
    // 역병이 예정이면 해체로 유휴 정착민을 늘려 버티는 수도 본다(계열마다 가장 낮은 레벨 1개)
    if (plague(p)) {
      for (const k of BUILDING_KINDS) {
        const lvl = p.buildings[k].findIndex((n) => n > 0);
        if (lvl >= 0) out.push({ type: 'disband', group: 'building', kind: k, level: lvl });
      }
    }
    if (p.legacyWip) out.push({ type: 'legacyStage' });
    state.satMarket.forEach((id, slot) => {
      if (id) out.push(p.orbit.length >= 2 ? { type: 'launch', slot, replace: p.orbit[0].timer <= p.orbit[1].timer ? 0 : 1 } : { type: 'launch', slot });
    });
    for (const f of CHARTER_FIELDS) out.push({ type: 'charter', field: f });
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

/** 퀘스트 선택: 보이는 칸은 한 수 적용해 보고(상대 손해 포함), 뒷면 칸은 상수 기대값. 뒷면은 엿보지 않는다 */
function questChoice(state: GameState, p: PlayerState): Action {
  // 시험 수는 내 시야로 가린 상태에서 둔다 — 당겨져 들어올 뒷면 칸·덱·후원 계약 덱을 엿보지 않기 위해
  const view = maskFor(state, p.id);
  const me = view.players[p.id];
  const base = evaluate(view, me);
  let best: Action = firstPickable(view, me);
  let bestScore = -Infinity;
  for (let slot = 0; slot < view.questRow.length; slot++) {
    if (pickBlock(view, me, slot)) continue;
    const action: Action = { type: 'pickQuest', slot };
    let score = BLIND_PICK_VALUE;
    if (slotVisible(view, p.id, slot)) {
      const s = simulate(view, p.id, action);
      if (!s) continue;
      score = evaluate(s, s.players[p.id]) - base;
      for (const o of view.players) if (o.id !== p.id) score += (evaluate(view, o) - evaluate(s, s.players[o.id])) * HARM_WEIGHT;
    }
    if (score > bestScore) {
      bestScore = score;
      best = action;
    }
  }
  return best;
}

function firstPickable(state: GameState, p: PlayerState): Action {
  const slot = state.questRow.findIndex((_, i) => !pickBlock(state, p, i));
  return { type: 'pickQuest', slot: Math.max(0, slot) };
}

/** AI 행동이 거절됐을 때 대신 둘 수(서버·로컬 공용): 결정 대기면 0번, 퀘스트 선택이면 고를 수 있는 첫 칸, 아니면 차례 종료 */
export function fallbackAction(state: GameState, actor: number): Action {
  if (state.pending.length) return { type: 'respond', choice: 0 };
  if (state.phase === 'quest') return firstPickable(state, state.players[actor]);
  return { type: 'endTurn' };
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
  p.hand.forEach((h, card) => {
    const c = CARD_DEFS[h.id];
    if (h.fresh || !c) return;
    if (c.type === 'raid' && def >= RAID_DEFENSE) {
      for (const t of state.players) {
        if (canTarget(state, p, t.id)) continue;
        const swarm = stage(p, 'symbiont') >= 2;
        if (swarm && raidWins(state, p, t.id, true)) consider({ type: 'raid', card, target: t.id, effect: c.effects[0], swarm: true });
        if (raidWins(state, p, t.id, false, c)) {
          const effects: RaidEffect[] = [...c.effects];
          if (stage(p, 'ark') >= 2) effects.push('abduct');
          for (const e of effects) consider({ type: 'raid', card, target: t.id, effect: e });
        }
      }
    }
    if (c.type === 'conflict' && state.era >= 2 && !p.conflict && defenseMax(p) >= CONFLICT_DEFENSE) {
      for (const t of state.players) {
        if (canTarget(state, p, t.id)) continue;
        const margin = attackValue(p, t) + c.atk - defenseValue(t);
        if (margin >= 4) {
          const score = margin * 0.6 - (c.loss === 'culture' && t.res.culture < 6 ? 1.5 : 0);
          if (!best || score > best.score) best = { action: { type: 'declareConflict', card, target: t.id }, score };
        }
      }
    }
  });
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
  if (lean.phase === 'quest') return questChoice(state, state.players[pid]);
  if (lean.phase === 'external') {
    const ext = externalChoice(lean, p, base);
    if (ext && ext.score > 0.5) return ext.action;
  }
  for (const a of candidates(lean, p)) {
    const s = simulate(lean, pid, a);
    if (!s) continue;
    const score = evaluate(s, s.players[pid]) - base;
    if (!best || score > best.score) best = { action: a, score };
  }
  if (best && best.score > 0.15) return best.action;
  return { type: 'endTurn' };
}

