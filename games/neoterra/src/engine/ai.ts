// AI 결정: 후보 행동을 한 수 적용해 보고 평가 함수 증가량이 가장 큰 것을 고른다(결정적, 난수 없음)
import type { Action, GameState, PlayerState, RaidEffect, UnitKind } from './types';
import { BUILDING_KINDS, CHARTER_FIELDS, DOCTRINES, UNIT_KINDS } from './types';
import { BUILDING_COST, CHARTER_COST, CHARTER_FULL_POINTS, COLONIST_FOOD, CONFLICT_DEFENSE, PATRON_FAIL_CULTURE, PATRON_LIMIT, PATRON_MET_CULTURE_PER_ERA, RAID_DEFENSE, TRUNK_BASE_COST, UNIT_COST } from './data/constants';
import { CARD_DEFS } from './data/cards';
import { QUEST_DEFS } from './data/quests';
import { PATRONS, PATRON_DEFS } from './data/patrons';
import { applyAction } from './rules/turn';
import { feastBundles } from './rules/actions';
import {
  attackValue,
  buildingCap,
  buildingUnlocked,
  commandLeft,
  defenseLeft,
  defenseMax,
  defenseValue,
  mainDoctrine,
  metric,
  might,
  plague,
  playerMods,
  productionPreview,
  unhealthy,
  stage,
  unitUnlocked,
} from './rules/derive';
import { researchBlock, researchCost, webGraph, researchedCount, trunksAt } from './rules/research';
import { canTarget, raidWins } from './rules/external';
import { pendingChoices, pickBlock, slotVisible } from './rules/quest';
import { maskFor } from './mask';

const THREAT_LEVEL = [0, 5, 9, 14, 14];
/** 뒷면 카드를 모른 채 고를 때 기대 가치(임시). 덱 평균을 엿보지 않고 상수로 둔다.
 *  1.5 는 칸 1 의 한 수 평가보다 자주 커서 칸 2 를 기계적으로 골랐다(트랙 2칸 이동 → 덱 소모·카드 낭비 착시). 2026-11-03 측정으로 0.5 */
const BLIND_PICK_VALUE = 0.5;
/** 상대에게 준 손해를 내 이득으로 셈하는 비율 */
const HARM_WEIGHT = 0.3;
/** 쌓인 식량이 남은 판에 필요한 양(정착민 늘리기 + 유지비 적자)의 이 배수를 넘으면 식량 생산의 가치를 거의 없는 것으로 본다 */
const FOOD_NEED_MARGIN = 1.2;
/** 지휘·방위 행동 1개의 라운드당 가치(문화 환산, 임시) */
const COMMAND_VALUE = 0.9;
const DEFENSE_VALUE = 0.3;
/** 유휴 정착민 1명의 가치. 0.6 이면 할인 평가 뒤 연구에 밀려 정착민 15명, 2.0 이면 19.8명이지만 3번 자리 승률이 24%로 무너졌다(2026-11-03) */
const IDLE_VALUE = 1.4;
/** 보상 선택에서 지금 주 노선 쪽에 더하는 가산(노선 단계를 모으는 방향을 유지) */
const MAIN_DOCTRINE_PULL = 1;

/** 쌓아 둔 자원은 쓸 곳이 한정돼 있으니 일정량을 넘으면 가치를 크게 깎는다(쌓아 두기만 하는 착시 방지) */
const STOCK_SOFT_CAP = { food: 8, prod: 10, sci: 10 };
const soft = (x: number, cap: number) => Math.min(x, cap) + Math.max(0, x - cap) * 0.15;

function remainingRounds(state: GameState): number {
  if (state.endTriggered) return state.round < (state.endRound ?? state.round) ? 2 : 1;
  if (state.era >= 4) return 2;
  // 시대 진행도(줄기 합)에 묶으면 내 줄기 연구가 "남은 판을 줄이는" 손해로 보여 연구를 미룬다 — 라운드만으로 추정한다
  const inEra = state.round - state.eraStartRound;
  return (3 - state.era) * 6 + Math.max(1, 6 - inEra) + 2;
}

const familyCount = (p: PlayerState, k: (typeof BUILDING_KINDS)[number]) => p.buildings[k].reduce((a, n) => a + n, 0);

/** 플레이어 한 명의 대략적 가치(문화 환산) */
export function evaluate(state: GameState, p: PlayerState): number {
  const R = remainingRounds(state);
  const resW = Math.min(1, R / 6);
  const mods = playerMods(p);
  const pv = productionPreview(p, mods);
  let v = p.res.culture;
  v += DOCTRINES.reduce((a, d) => a + p.doctrine[d] * 0.8, 0);
  // 식량은 정착민 늘리기·유지비 말고 쓸 곳이 없다 — 남은 판에 필요한 양으로 식량 생산의 가치를 줄인다(식량 쌓기 착시 방지).
  // 재고 가치에는 쓰지 않는다: 정착민을 늘리면 필요량도 줄어 식량 쓰기가 손해로 보이기 때문
  const foodNeed = Math.max(4, p.pool * (COLONIST_FOOD[Math.min(state.era, 4)] ?? 4) + Math.max(0, -pv.net.food) * R);
  v += (soft(p.res.food, STOCK_SOFT_CAP.food) * 0.3 + soft(p.res.prod, STOCK_SOFT_CAP.prod) * 0.4 + Math.min(p.res.energy, 8) * 0.2 + soft(p.res.sci, STOCK_SOFT_CAP.sci) * 0.5) * resW;
  // 식량은 정착민·손실 대비 말고는 쓸 곳이 적다 — 쌓아 둔 양이 많을수록 식량 생산의 가치를 줄인다(농장만 키우는 착시 방지)
  const foodW = Math.max(0.05, 1 - p.res.food / (foodNeed * FOOD_NEED_MARGIN));
  v += R * (pv.gross.culture * 1 + pv.gross.sci * 0.6 + pv.gross.prod * 0.45 + pv.net.food * 0.35 * foodW + pv.gross.energy * 0.15);
  // 늘어난 행동 수(줄기·헌장·노선·후원자): 한 수 앞만 보면 0으로 보이니 남은 라운드만큼 직접 셈한다
  v += Math.min(R, 10) * (mods.command * COMMAND_VALUE + mods.defense * DEFENSE_VALUE);
  // 영구 할인: 한 수 앞만 보면 0으로 보여 (가중치는 2026-11-03 3인 120판으로 고름: 0.45 는 판이 18.9R 로 짧아짐)
  // 할인 곁가지(양자 연구망 등)를 거의 안 했다 — 차례당 한 번 쓴다고 보고 남은 라운드만큼 셈한다
  v += Math.min(R, 10) * (mods.researchDiscount * 0.3 + mods.trunkDiscount * 0.15 + mods.unitUpgradeDiscount * 0.1);
  // 한도가 찬 건물 계열의 한도 증가는 다음 건설을 여는 가치
  if (mods.buildingCap > 0 && BUILDING_KINDS.some((k) => familyCount(p, k) >= buildingCap(p, k, mods))) v += mods.buildingCap * 2 * Math.min(1, R / 4);
  v += researchedCount(p) * 0.6 * Math.min(1, R / 4);
  // 줄기는 높은 고리일수록 큰 건물·유닛 레벨을 연다 — 기본 비용에 비례해 평가(고리 2·3 줄기를 미루는 착시 방지)
  const trunkValue = [1, 2, 3].reduce((a, r) => a + trunksAt(p, r) * TRUNK_BASE_COST[r], 0);
  v += trunkValue * Math.min(1, R / 4);
  if (state.era <= 3) v += trunksAt(p, state.era) * 1.0 * Math.min(1, R / 4);
  const m = might(p, mods);
  const lvl = THREAT_LEVEL[state.era];
  v += Math.min(m, lvl) * 0.7 + Math.max(0, m - lvl) * 0.1;
  v += p.idle * IDLE_VALUE * Math.min(1, R / 4);
  for (const h of p.hand) {
    const c = CARD_DEFS[h.id];
    if (!c) continue; // 가린 손패
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
    // 못 끝낸 유산은 0점 — 남은 단계를 남은 라운드 안에 끝낼 수 있을 때만 진행분을 가치로 본다(판 끝 착공·방치 착시 방지)
    if (c.type === 'legacy') {
      const left = c.stages.length - p.legacyWip.done;
      const feasible = Math.min(1, R / (left * 1.5));
      v += ((p.legacyWip.done / c.stages.length) * c.points + 1) * feasible;
    }
  }
  for (const id of p.legacies) {
    const c = CARD_DEFS[id];
    if (c.type === 'legacy') v += c.points;
  }
  // 헌장은 문화를 내고 효과를 오래 받는 투자 — 한 수 앞만 보면 늘 손해로 보이니 산 단계를 비용의 일부로 셈한다(남은 판이 길수록 높게)
  // 효과(한도·할인·건강)는 한 수 평가에 잘 안 잡히므로, 판이 길게 남으면 비용보다 조금 높게, 끝 무렵엔 낮게 본다
  const charterKeep = 0.7 + 0.5 * Math.min(1, R / 8);
  v += CHARTER_FIELDS.reduce((a, f) => {
    let x = p.charters[f] >= 3 ? CHARTER_FULL_POINTS : 0;
    for (let l = 1; l <= p.charters[f]; l++) x += CHARTER_COST[l] * charterKeep;
    return a + x;
  }, 0);
  v += p.patrons.reduce((a, id) => a + patronWorth(state, p, id), 0);
  v += mods.sight * 0.4 * Math.min(1, R / 3);
  v += p.facilities.length * 1;
  return v;
}

/** 주둔지 1장의 대략적 가치(문화 환산): 점수 + 효과 + 남은 요구 검사의 기대 손익.
 *  요구는 지금 지표가 기준에 얼마나 가까운지로 가망을 본다(받은 시대 끝에는 검사 면제 — Rules 13절) */
function patronWorth(state: GameState, p: PlayerState, id: string): number {
  const def = PATRON_DEFS[id];
  if (!def) return 0;
  const have = metric(state, p, def.demand.metric);
  const ratio = def.demand.min > 0 ? have / def.demand.min : 1;
  const chance = ratio >= 1 ? 1 : ratio >= 0.6 ? (ratio - 0.4) * 1.5 : 0;
  // 남은 검사 수: 카드 시대 다음 전환부터 3→4 전환까지 + 종료 검사 1
  const checks = Math.max(0, 4 - Math.max(state.era, def.era + 1)) + 1;
  const perCheck = chance * Math.min(state.era + 1, 3) * PATRON_MET_CULTURE_PER_ERA - (1 - chance) * PATRON_FAIL_CULTURE;
  return def.points + 1.5 + checks * perCheck;
}

/** 주둔지 제안 칸의 기대 가치: 그 시대 주둔지 중 남은 것마다 내가 지표 1위(동점은 고른 사람 먼저)면 받을 가치 */
function patronOfferValue(state: GameState, p: PlayerState, era: number): number {
  if (!state.patronDecks[era as 1 | 2 | 3]?.length) return 0; // 장수는 공개 정보
  const held = new Set(state.players.flatMap((x) => x.patrons));
  const pool = PATRONS.filter((d) => d.era === era && !held.has(d.id));
  if (!pool.length) return 0;
  let sum = 0;
  for (const d of pool) {
    const mine = metric(state, p, d.metric);
    const top = state.players.every((o) => o.id === p.id || metric(state, o, d.metric) <= mine);
    if (top) sum += Math.max(0, patronWorth(state, p, d.id));
  }
  return sum / pool.length;
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
      // 선택지를 실제로 적용해 평가 함수로 비교한다 — 고정 가중치는 시점과 무관하게 문화(방주 선택지)로 쏠린다
      // 시험 적용은 내 시야로 가린 상태에서 한다(퀘스트 선택과 같은 원칙: 덱·뒷면 칸을 엿보지 않음)
      const view = maskFor(state, pd.player);
      q.options.forEach((o, i) => {
        const r = applyAction(view, pd.player, { type: 'respond', choice: i });
        if (r.error) return;
        const v = evaluate(r.state, r.state.players[pd.player]) + (o.doctrine === main ? MAIN_DOCTRINE_PULL : 0);
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
      // 요구를 채울 가망이 없으면 거절한다(문화 −3 을 시대마다 내는 착시 방지)
      const worth = patronWorth(state, p, pd.patronId);
      if (worth <= 0) return 0;
      if (p.patrons.length < PATRON_LIMIT) return 1;
      let worst = -1;
      let worstV = worth;
      p.patrons.forEach((id, i) => {
        const w = patronWorth(state, p, id);
        if (w < worstV) {
          worstV = w;
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
  // 시험 수는 내 시야로 가린 상태에서 둔다 — 당겨져 들어올 뒷면 칸·덱·주둔지 덱을 엿보지 않기 위해
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
      // 가린 상태에서는 주둔지 덱 맨 위를 몰라 제안이 0점으로 보인다 — 공개 정보로 기대값을 더한다
      const q = QUEST_DEFS[view.questRow[slot]];
      if (q?.kind === 'patron') score += patronOfferValue(view, me, q.era);
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
  // 개척 만찬은 차례를 마치기 직전에만 — 먼저 하면 정착민 늘리기에 쓸 식량을 문화로 바꿔 버린다(남는 식량만 바꾸는 행동)
  // 대외 단계에서 끝내는 차례도 포함: 여기까지 왔으면 습격·분쟁은 하지 않기로 한 것이라 대외 단계가 끝나도 잃는 것이 없다
  if (!p.feasted && feastBundles(p.res.food) > 0) return { type: 'feast' };
  return { type: 'endTurn' };
}

