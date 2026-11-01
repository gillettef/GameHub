// 파생값: 수정치, 행동 수, 방위력, 건강, 생산 예상, 노선 단계, 지표 (상태에 캐시하지 않는다)
import type { BuildingKind, Doctrine, GameState, Metric, Mods, PlayerState, Res, UnitKind } from '../types';
import { BUILDING_KINDS, DOCTRINES, RES_KEYS, UNIT_KINDS, CHARTER_FIELDS } from '../types';
import {
  BASE_COMMAND,
  BASE_DEFENSE,
  BEATS,
  BUILDING_DIRECTION,
  BUILDING_OUTPUT,
  BUILDING_RES,
  CHARTER_MODS,
  DIRECTION_UNLOCKS,
  DOCTRINE_MAX_STAGE,
  DOCTRINE_STEP,
  EDGE_BONUS,
  FAMILY_BASE_CAP,
  UNIT_POOL_BASE_CAP,
  UNIT_POOL_PER_TRUNK,
  FIRST_ROUND_COMMAND,
  SPORE_CAP,
  SPORE_STEP,
  UNIT_DIRECTION,
  UNIT_POWER,
  colonistTrack,
} from '../data/constants';
import { STAGE_MODS } from '../data/doctrines';
import { CARD_DEFS } from '../data/cards';
import { TWIG_DEFS } from '../data/techWeb';
import { PATRON_DEFS } from '../data/patrons';
import { FACILITY_DEFS } from '../data/quests';
import { SATELLITE_DEFS } from '../data/satellites';
import { addMods, emptyMods, sumLevels } from './util';
import { hasTrunk, researchedCount, trunksInDirection } from './research';

export function stage(p: PlayerState, d: Doctrine): number {
  return Math.min(DOCTRINE_MAX_STAGE, Math.floor(Math.max(0, p.doctrine[d]) / DOCTRINE_STEP));
}

export function mainDoctrine(p: PlayerState): Doctrine | null {
  const max = Math.max(...DOCTRINES.map((d) => p.doctrine[d]));
  if (max <= 0) return null;
  const top = DOCTRINES.filter((d) => p.doctrine[d] === max);
  return top.length === 1 ? top[0] : null;
}

export function isHybrid(p: PlayerState): boolean {
  return DOCTRINES.filter((d) => stage(p, d) >= 2).length >= 2;
}

/** 모든 영구 수정치의 합 */
export function playerMods(p: PlayerState): Mods {
  const m = emptyMods();
  for (const id of p.researched) {
    if (id.startsWith('w:')) addMods(m, TWIG_DEFS[id.slice(2)]?.mods);
  }
  for (const d of DOCTRINES) {
    const s = stage(p, d);
    for (let i = 1; i <= s; i++) addMods(m, STAGE_MODS[d][i]);
  }
  for (const f of CHARTER_FIELDS) {
    for (let i = 1; i <= p.charters[f]; i++) addMods(m, CHARTER_MODS[f][i]);
  }
  if (p.pioneer) {
    const c = CARD_DEFS[p.pioneer];
    if (c?.type === 'pioneer') addMods(m, c.mods);
  }
  for (const id of p.legacies) {
    const c = CARD_DEFS[id];
    if (c?.type === 'legacy') addMods(m, c.mods);
  }
  for (const id of p.patrons) addMods(m, PATRON_DEFS[id]?.mods);
  for (const id of p.facilities) addMods(m, FACILITY_DEFS[id]?.mods);
  for (const o of p.orbit) {
    addMods(m, SATELLITE_DEFS[o.id]?.mods);
    m.sight += 1;
  }
  return m;
}

export function commandMax(state: GameState, p: PlayerState, mods = playerMods(p)): number {
  let n = BASE_COMMAND + mods.command;
  for (const dir of ['academic', 'culture'] as const) {
    const cmd = DIRECTION_UNLOCKS[dir].command ?? [];
    for (let r = 1; r <= 3; r++) if (cmd[r] && hasTrunk(p, dir, r)) n += cmd[r];
  }
  if (state.round === 1) {
    const seat = (p.id - state.startPlayer + state.players.length) % state.players.length;
    n = Math.min(n, FIRST_ROUND_COMMAND[seat]);
  }
  return n;
}

export function defenseMax(p: PlayerState, mods = playerMods(p)): number {
  let n = BASE_DEFENSE + mods.defense;
  const def = DIRECTION_UNLOCKS.defense.defense ?? [];
  for (let r = 1; r <= 3; r++) if (def[r] && hasTrunk(p, 'defense', r)) n += def[r];
  return n;
}

export const commandLeft = (state: GameState, p: PlayerState) => commandMax(state, p) - p.commandUsed;
export const defenseLeft = (p: PlayerState) => defenseMax(p) - p.defenseUsed;

export function unitCount(p: PlayerState, k: UnitKind): number {
  return sumLevels(p.units[k]);
}
export function buildingCount(p: PlayerState, k: BuildingKind): number {
  return sumLevels(p.buildings[k]);
}

/** 방위력 = 유닛 전력 + 상황 보너스(방위 태세 포함) */
export function might(p: PlayerState, mods = playerMods(p)): number {
  let total = 0;
  for (const k of UNIT_KINDS) {
    const bonus = mods.unitPower[k] ?? 0;
    p.units[k].forEach((n, lvl) => {
      if (n > 0) total += n * ((UNIT_POWER[k][lvl] ?? 0) + bonus);
    });
  }
  total += unitCount(p, 'flyer') * p.orbit.length;
  return total + mods.might + p.guard;
}

export function edgeBonus(attacker: PlayerState, target: PlayerState): number {
  if (isHybrid(attacker) || isHybrid(target)) return 0;
  const a = mainDoctrine(attacker);
  const t = mainDoctrine(target);
  if (!a || !t || a === t) return 0;
  if (BEATS[a] === t) return EDGE_BONUS;
  if (BEATS[t] === a) return -EDGE_BONUS;
  return 0;
}

export function attackValue(attacker: PlayerState, target: PlayerState): number {
  const mods = playerMods(attacker);
  return might(attacker, mods) + unitCount(attacker, 'rider') + edgeBonus(attacker, target) + mods.raidBonus;
}

export function defenseValue(p: PlayerState): number {
  return might(p) + unitCount(p, 'battery');
}

export function placedColonists(p: PlayerState): number {
  let n = 0;
  for (const k of BUILDING_KINDS) n += buildingCount(p, k);
  for (const k of UNIT_KINDS) n += unitCount(p, k);
  return n;
}
export const totalColonists = (p: PlayerState) => placedColonists(p) + p.idle;

/** 필요 건강: 정착민 공급 트랙에 인쇄된 값 */
export function requiredHealth(p: PlayerState): number {
  return colonistTrack(totalColonists(p)).health;
}

/** 불건강 정착민 수(건강 부족분). 유휴 정착민보다 많으면 역병 */
export function unhealthy(p: PlayerState, mods = playerMods(p)): number {
  return Math.max(0, requiredHealth(p) - health(p, mods));
}
export const plague = (p: PlayerState, mods = playerMods(p)): boolean => unhealthy(p, mods) > p.idle;

export function sporePenalty(p: PlayerState, mods = playerMods(p)): number {
  const cap = SPORE_CAP + mods.sporeCap;
  return p.res.energy > cap ? Math.ceil((p.res.energy - cap) / SPORE_STEP) : 0;
}

export function health(p: PlayerState, mods = playerMods(p)): number {
  return buildingCount(p, 'hall') + mods.health - sporePenalty(p, mods) - p.coexist;
}

export interface ProductionPreview {
  gross: Res;
  /** 역병: 이번 생산 단계의 건물 생산이 모두 멈춤 */
  plague: boolean;
  upkeep: number;
  net: Res;
}

/** 생산 단계 예상(역병·식량 소비 포함). 역병이면 건물 생산만 멈추고 생산 단계 보너스·식량 소비는 그대로 */
export function productionPreview(p: PlayerState, mods = playerMods(p)): ProductionPreview {
  const sick = plague(p, mods);
  const gross: Res = { food: 0, prod: 0, energy: 0, sci: 0, culture: 0 };
  if (!sick)
    for (const k of BUILDING_KINDS) p.buildings[k].forEach((n, lvl) => {
      const out = BUILDING_OUTPUT[k][lvl];
      if (out != null) gross[BUILDING_RES[k]] += n * (out + (mods.buildingBonus[k] ?? 0));
    });
  for (const k of RES_KEYS) gross[k] += mods.income[k] ?? 0;
  const upkeep = Math.max(0, colonistTrack(totalColonists(p)).food - mods.foodUpkeep);
  const net = { ...gross, food: gross.food - upkeep };
  return { gross, plague: sick, upkeep, net };
}

export function buildingCap(p: PlayerState, k: BuildingKind, mods = playerMods(p)): number {
  return FAMILY_BASE_CAP + trunksInDirection(p, BUILDING_DIRECTION[k]) + mods.buildingCap;
}
/** 유닛 총수 한도(4계열 합산) — Rules.md 7.3 */
export function unitPoolCap(p: PlayerState, mods = playerMods(p)): number {
  return UNIT_POOL_BASE_CAP + UNIT_POOL_PER_TRUNK * trunksInDirection(p, 'defense') + mods.unitCap;
}
export const unitTotal = (p: PlayerState): number => UNIT_KINDS.reduce((a, k) => a + unitCount(p, k), 0);
/** 계열 k 가 도달할 수 있는 수(화면 표시용): 지금 수 + 총수 한도의 남은 칸 */
export function unitRoom(p: PlayerState, k: UnitKind, mods = playerMods(p)): number {
  return unitCount(p, k) + Math.max(0, unitPoolCap(p, mods) - unitTotal(p));
}

/** 해금된 최고 레벨. 기초(0)는 기초가 있는 계열이면 항상 가능 */
export function buildingUnlocked(p: PlayerState, k: BuildingKind, level: number): boolean {
  if (BUILDING_OUTPUT[k][level] == null) return false;
  if (level === 0) return true;
  return hasTrunk(p, BUILDING_DIRECTION[k], level);
}
export function unitUnlocked(p: PlayerState, k: UnitKind, level: number): boolean {
  if (UNIT_POWER[k][level] == null) return false;
  if (level === 0) return true;
  const dir = UNIT_DIRECTION[k];
  const levels = DIRECTION_UNLOCKS[dir].units?.find((u) => u.kind === k)?.levels ?? [];
  for (let r = 1; r <= 3; r++) if (levels[r] === level && hasTrunk(p, dir, r)) return true;
  return false;
}

export function sight(p: PlayerState, mods = playerMods(p)): number {
  return mods.sight;
}

export function buildingLevels(p: PlayerState): number {
  let n = 0;
  for (const k of BUILDING_KINDS) p.buildings[k].forEach((c, lvl) => (n += c * lvl));
  return n;
}

export function metric(_state: GameState, p: PlayerState, m: Metric): number {
  switch (m) {
    case 'might':
      return might(p);
    case 'nodes':
      return researchedCount(p);
    case 'trunks':
      return p.researched.filter((id) => id.startsWith('t:')).length;
    case 'buildingLevels':
      return buildingLevels(p);
    case 'buildings':
      return BUILDING_KINDS.reduce((a, k) => a + buildingCount(p, k), 0);
    case 'units':
      return UNIT_KINDS.reduce((a, k) => a + unitCount(p, k), 0);
    case 'cultureRate':
      return productionPreview(p).gross.culture;
    case 'sciRate':
      return productionPreview(p).gross.sci;
    case 'foodRate':
      return productionPreview(p).net.food;
    case 'prodRate':
      return productionPreview(p).gross.prod;
    case 'energy':
      return p.res.energy;
    case 'satellites':
      return p.orbit.length;
    case 'colonists':
      return totalColonists(p);
    case 'halls':
      return buildingCount(p, 'hall');
    case 'labs':
      return buildingCount(p, 'lab');
    case 'farms':
      return buildingCount(p, 'farm');
    case 'workshops':
      return buildingCount(p, 'workshop');
    case 'powers':
      return buildingCount(p, 'power');
    case 'riders':
      return unitCount(p, 'rider');
    case 'batteries':
      return unitCount(p, 'battery');
    case 'doctrineTotal':
      return DOCTRINES.reduce((a, d) => a + p.doctrine[d], 0);
    case 'ark':
    case 'symbiont':
    case 'synth':
      return p.doctrine[m];
    case 'legacies':
      return p.legacies.length;
    case 'health':
      return health(p);
  }
}

export function meets(state: GameState, p: PlayerState, conds: { metric: Metric; min: number }[]): boolean {
  return conds.every((c) => metric(state, p, c.metric) >= c.min);
}
