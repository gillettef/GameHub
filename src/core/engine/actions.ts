// 행동 단계의 지휘·방위 행동 (Rules.md 9절 4단계)
import type { Action, BuildingKind, CharterField, GameState, PlayerState, UnitKind } from '../types';
import {
  BUILDING_COST,
  BUILDING_NAMES,
  CHARTER_COST,
  CHARTER_NAMES,
  COLONIST_FOOD,
  FLYER_ENERGY,
  LEVEL_NAMES,
  ORBIT_SLOTS,
  TRUNK_NAMES,
  UNIT_COST,
  UNIT_NAMES,
} from '../data/constants';
import { CARD_DEFS } from '../data/cards';
import { SATELLITE_DEFS } from '../data/satellites';
import { webGraph, researchBlock, researchCost } from './research';
import {
  buildingCap,
  buildingCount,
  buildingUnlocked,
  commandLeft,
  defenseLeft,
  playerMods,
  unitCap,
  unitCount,
  unitUnlocked,
} from './derive';
import { addDoctrine, applyInstant } from './effects';
import { log } from './util';

type Err = string | null;

function needCommand(state: GameState, p: PlayerState, n = 1): Err {
  return commandLeft(state, p) >= n ? null : '지휘 행동이 부족합니다';
}
function needDefense(p: PlayerState, n = 1): Err {
  return defenseLeft(p) >= n ? null : '방위 행동이 부족합니다';
}

export function unitUpgradeCost(p: PlayerState, k: UnitKind, from: number, to: number): number {
  const a = UNIT_COST[k][from] ?? 0;
  const b = UNIT_COST[k][to] ?? 0;
  return Math.max(1, b - a - playerMods(p).unitUpgradeDiscount);
}

export function buildingUpgradeCost(from: number, to: number): number {
  return BUILDING_COST[to] - BUILDING_COST[from];
}

/** 행동 단계 행동을 검증하고 적용한다(state 는 이미 복제본) */
export function applyMainAction(state: GameState, p: PlayerState, a: Action): Err {
  switch (a.type) {
    case 'research': {
      const block = researchBlock(state, p, a.node);
      if (block) return block;
      const err = needCommand(state, p);
      if (err) return err;
      const cost = researchCost(state, p, a.node, playerMods(p));
      if (p.res.sci < cost) return '과학이 부족합니다';
      p.res.sci -= cost;
      p.commandUsed++;
      p.researched.push(a.node);
      const node = webGraph(state.layout).nodes[a.node];
      if (node.twig) {
        addDoctrine(state, p, node.twig.doctrine, node.twig.points);
        applyInstant(state, p, node.twig.instant);
        log(state, p.id, `곁가지 「${node.twig.name}」 연구`);
      } else {
        log(state, p.id, `줄기 「${TRUNK_NAMES[node.direction!][node.ring]}」 연구`);
      }
      return null;
    }
    case 'useSupply': {
      const h = p.hand[a.index];
      if (!h) return '없는 카드';
      if (h.fresh) return '가져온 차례에는 쓸 수 없습니다';
      const err = needCommand(state, p);
      if (err) return err;
      const card = CARD_DEFS[h.id];
      if (card.type !== 'supply') return '자원 팟 카드가 아닙니다';
      p.commandUsed++;
      p.hand.splice(a.index, 1);
      applyInstant(state, p, card.instant);
      log(state, p.id, `자원 팟 「${card.name}」 사용`);
      return null;
    }
    case 'build':
      return build(state, p, a.kind, a.level);
    case 'upgrade': {
      if (a.to <= a.from) return '잘못된 레벨';
      if ((p.buildings[a.kind][a.from] ?? 0) < 1) return '해당 건물이 없습니다';
      if (!buildingUnlocked(p, a.kind, a.to)) return '아직 해금되지 않은 레벨';
      const err = needCommand(state, p);
      if (err) return err;
      const cost = buildingUpgradeCost(a.from, a.to);
      if (p.res.prod < cost) return '생산이 부족합니다';
      p.res.prod -= cost;
      p.commandUsed++;
      p.buildings[a.kind][a.from]--;
      p.buildings[a.kind][a.to]++;
      log(state, p.id, `${BUILDING_NAMES[a.kind]} ${LEVEL_NAMES[a.from]} → ${LEVEL_NAMES[a.to]}`);
      return null;
    }
    case 'buildUnit':
      return buildUnit(state, p, a.kind, a.level);
    case 'upgradeUnit': {
      if (a.to <= a.from) return '잘못된 레벨';
      if ((p.units[a.kind][a.from] ?? 0) < 1) return '해당 유닛이 없습니다';
      if (!unitUnlocked(p, a.kind, a.to)) return '아직 해금되지 않은 레벨';
      const err = needDefense(p);
      if (err) return err;
      const cost = unitUpgradeCost(p, a.kind, a.from, a.to);
      if (p.res.prod < cost) return '생산이 부족합니다';
      p.res.prod -= cost;
      p.defenseUsed++;
      p.units[a.kind][a.from]--;
      p.units[a.kind][a.to]++;
      log(state, p.id, `${UNIT_NAMES[a.kind]} ${LEVEL_NAMES[a.from]} → ${LEVEL_NAMES[a.to]}`);
      return null;
    }
    case 'disband': {
      const levels = a.group === 'building' ? p.buildings[a.kind as BuildingKind] : p.units[a.kind as UnitKind];
      if (!levels || (levels[a.level] ?? 0) < 1) return '해체할 대상이 없습니다';
      const err = needCommand(state, p);
      if (err) return err;
      p.commandUsed++;
      levels[a.level]--;
      p.idle++;
      log(state, p.id, `${a.group === 'building' ? BUILDING_NAMES[a.kind as BuildingKind] : UNIT_NAMES[a.kind as UnitKind]} ${LEVEL_NAMES[a.level]} 해체`);
      return null;
    }
    case 'addColonist': {
      const err = needCommand(state, p);
      if (err) return err;
      if (p.pool < 1) return '공급에 정착민이 없습니다';
      const cost = COLONIST_FOOD[state.era];
      if (p.res.food < cost) return '식량이 부족합니다';
      p.res.food -= cost;
      p.commandUsed++;
      p.pool--;
      p.idle++;
      log(state, p.id, '정착민 늘리기');
      return null;
    }
    case 'legacyStage': {
      if (!p.legacyWip) return '짓는 유산이 없습니다';
      const card = CARD_DEFS[p.legacyWip.id];
      if (card.type !== 'legacy') return '유산이 아닙니다';
      const err = needCommand(state, p);
      if (err) return err;
      const cost = card.stages[p.legacyWip.done];
      if (p.res.prod < cost) return '생산이 부족합니다';
      p.res.prod -= cost;
      p.commandUsed++;
      p.legacyWip.done++;
      if (p.legacyWip.done >= card.stages.length) {
        p.legacies.push(card.id);
        p.legacyWip = null;
        log(state, p.id, `유산 「${card.name}」 완성`);
      } else {
        log(state, p.id, `유산 「${card.name}」 ${p.legacyWip.done}/${card.stages.length}단계`);
      }
      return null;
    }
    case 'launch': {
      const id = state.satMarket[a.slot];
      if (!id) return '빈 칸입니다';
      const sat = SATELLITE_DEFS[id];
      const err = needCommand(state, p);
      if (err) return err;
      if (p.res.energy < sat.cost) return '에너지가 부족합니다';
      if (p.orbit.length >= ORBIT_SLOTS && (a.replace === undefined || !p.orbit[a.replace])) return '궤도가 가득 찼습니다 — 교체할 위성을 고르세요';
      p.res.energy -= sat.cost;
      p.commandUsed++;
      if (p.orbit.length >= ORBIT_SLOTS) {
        const gone = p.orbit.splice(a.replace!, 1)[0];
        log(state, p.id, `위성 「${SATELLITE_DEFS[gone.id].name}」 추락`);
      }
      p.orbit.push({ id, timer: sat.timer });
      state.satMarket[a.slot] = state.satDeck.shift() ?? null;
      log(state, p.id, `위성 「${sat.name}」 발사`);
      return null;
    }
    case 'charter':
      return buyCharter(state, p, a.field);
    default:
      return '행동 단계에서 할 수 없는 행동';
  }
}

function build(state: GameState, p: PlayerState, k: BuildingKind, level: number): Err {
  if (!buildingUnlocked(p, k, level)) return '아직 해금되지 않은 건물';
  if (buildingCount(p, k) >= buildingCap(p, k)) return `${BUILDING_NAMES[k]} 한도`;
  if (p.idle < 1) return '유휴 정착민이 없습니다';
  const err = needCommand(state, p);
  if (err) return err;
  const cost = BUILDING_COST[level];
  if (p.res.prod < cost) return '생산이 부족합니다';
  p.res.prod -= cost;
  p.commandUsed++;
  p.idle--;
  p.buildings[k][level]++;
  log(state, p.id, `${BUILDING_NAMES[k]} ${LEVEL_NAMES[level]} 건설`);
  return null;
}

function buildUnit(state: GameState, p: PlayerState, k: UnitKind, level: number): Err {
  if (!unitUnlocked(p, k, level)) return '아직 해금되지 않은 유닛';
  if (unitCount(p, k) >= unitCap(p, k)) return `${UNIT_NAMES[k]} 한도`;
  if (p.idle < 1) return '유휴 정착민이 없습니다';
  const err = needDefense(p);
  if (err) return err;
  const cost = UNIT_COST[k][level] ?? 0;
  const energy = k === 'flyer' ? FLYER_ENERGY : 0;
  if (p.res.prod < cost || p.res.energy < energy) return '자원이 부족합니다';
  p.res.prod -= cost;
  p.res.energy -= energy;
  p.defenseUsed++;
  p.idle--;
  p.units[k][level]++;
  log(state, p.id, `${UNIT_NAMES[k]} ${LEVEL_NAMES[level]} 편성`);
  return null;
}

function buyCharter(state: GameState, p: PlayerState, f: CharterField): Err {
  const next = p.charters[f] + 1;
  if (next > 3) return '이미 3단계입니다';
  const err = needCommand(state, p);
  if (err) return err;
  const cost = CHARTER_COST[next];
  if (p.res.culture < cost) return '문화가 부족합니다';
  p.res.culture -= cost;
  p.commandUsed++;
  p.charters[f] = next;
  log(state, p.id, `헌장 ${CHARTER_NAMES[f]} ${next}단계`);
  return null;
}
