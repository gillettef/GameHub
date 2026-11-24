// 대외 단계: 습격·분쟁 (Rules.md 10절)
import type { ConflictDef, GameState, PlayerState, RaidDef, RaidEffect } from '../types';
import { DOCTRINES } from '../types';
import {
  CONFLICT_CULTURE_MAX,
  CONFLICT_DEFENSE,
  CONFLICT_FAIL_CULTURE,
  ABDUCT_FALLBACK_FOOD,
  RAID_DEFENSE,
  raidAmount,
} from '../data/constants';
import { attackValue, defenseLeft, defenseMax, defenseValue, mainDoctrine, stage } from './derive';
import { CARD_DEFS } from '../data/cards';
import { addDoctrine, downgradeBuilding } from './effects';
import { log } from './util';

export type Err = string | null;

export function canTarget(state: GameState, p: PlayerState, target: number): Err {
  const t = state.players[target];
  if (!t || t.id === p.id) return '잘못된 대상';
  if (t.harmedRound === state.round) return '이번 라운드에 이미 피해를 입은 플레이어';
  return null;
}

export function swarmValue(state: GameState, p: PlayerState): number {
  return Math.min(state.era, 3) * 3 + stage(p, 'symbiont') * 2;
}

/** 손의 그 칸이 쓸 수 있는 습격·분쟁 카드인지 */
export function handCard<T extends 'raid' | 'conflict'>(p: PlayerState, index: number, type: T): { def: Extract<RaidDef | ConflictDef, { type: T }> } | string {
  const h = p.hand[index];
  if (!h) return '없는 카드';
  const def = CARD_DEFS[h.id];
  if (!def || def.type !== type) return type === 'raid' ? '습격 카드가 아닙니다' : '분쟁 카드가 아닙니다';
  if (h.fresh) return '가져온 차례에는 쓸 수 없습니다';
  return { def: def as Extract<RaidDef | ConflictDef, { type: T }> };
}

/** 습격 성공 여부 미리 보기(카드 공격 보정 포함. 무리 몰이는 카드 보정을 쓰지 않음) */
export function raidWins(state: GameState, p: PlayerState, target: number, swarm: boolean, card?: RaidDef): boolean {
  const t = state.players[target];
  const atk = swarm ? swarmValue(state, p) : attackValue(p, t) + (card?.atk ?? 0);
  return atk > defenseValue(t);
}

function take(p: PlayerState, t: PlayerState, key: 'prod' | 'food' | 'sci' | 'energy', n: number): number {
  const got = Math.min(n, t.res[key]);
  t.res[key] -= got;
  p.res[key] += got;
  return got;
}

export function raid(state: GameState, p: PlayerState, cardIndex: number, target: number, effect: RaidEffect, swarm: boolean): Err {
  const hc = handCard(p, cardIndex, 'raid');
  if (typeof hc === 'string') return hc;
  const card = hc.def;
  const err = canTarget(state, p, target);
  if (err) return err;
  if (defenseLeft(p) < RAID_DEFENSE) return '방위 행동이 부족합니다';
  if (swarm && stage(p, 'symbiont') < 2) return '무리 몰이는 공생 단계 2부터';
  if (!swarm && effect === 'abduct' && stage(p, 'ark') < 2) return '납치는 방주 단계 2부터';
  if (!swarm && effect !== 'abduct' && !card.effects.includes(effect)) return '이 카드로 고를 수 없는 효과입니다';
  p.defenseUsed += RAID_DEFENSE;
  p.hand.splice(cardIndex, 1);
  const t = state.players[target];
  const won = raidWins(state, p, target, swarm, card);
  if (!won) {
    log(state, p.id, `「${card.name}」 — ${t.name} 습격 실패`);
    return null;
  }
  t.harmedRound = state.round;
  if (swarm) {
    downgradeBuilding(state, t);
    addDoctrine(state, p, 'symbiont', 1);
    log(state, p.id, `「${card.name}」 — 무리 몰이로 ${t.name} 습격 성공`);
    return null;
  }
  const n = raidAmount(state.era) + card.bonus;
  let text = '';
  switch (effect) {
    case 'lootProd':
      text = `생산 ${take(p, t, 'prod', n)} 약탈`;
      break;
    case 'lootFood':
      text = `식량 ${take(p, t, 'food', n)} 약탈`;
      break;
    case 'stealSci':
      text = `과학 ${take(p, t, 'sci', n)} 탈취`;
      break;
    case 'stealEnergy':
      text = `에너지 ${take(p, t, 'energy', n)} 탈취`;
      break;
    case 'abduct':
      if (t.idle > 0) {
        t.idle--;
        p.pool++;
        text = '유휴 정착민 1명 납치';
      } else {
        text = `식량 ${take(p, t, 'food', ABDUCT_FALLBACK_FOOD)} 약탈`;
      }
      break;
  }
  log(state, p.id, `「${card.name}」 — ${t.name} 습격 성공: ${text}`);
  return null;
}

export function declareConflict(state: GameState, p: PlayerState, cardIndex: number, target: number): Err {
  if (state.era < 2) return '분쟁은 2시대부터';
  const hc = handCard(p, cardIndex, 'conflict');
  if (typeof hc === 'string') return hc;
  const card = hc.def;
  if (p.conflict) return '이미 선포한 분쟁이 있습니다';
  if (defenseMax(p) < CONFLICT_DEFENSE) return `판정에 방위 행동 ${CONFLICT_DEFENSE}이 필요합니다`;
  const err = canTarget(state, p, target);
  if (err) return err;
  p.hand.splice(cardIndex, 1);
  const loss = card.loss;
  p.conflict = { target, loss, atk: card.atk, card: card.id };
  const lossName = loss === 'culture' ? '문화' : loss === 'building' ? '건물' : '노선 점수';
  log(state, p.id, `「${card.name}」 — ${state.players[target].name}에게 분쟁 선포(노리는 손실: ${lossName})`);
  return null;
}

/** 내 차례 2단계: 지난 차례에 선포한 분쟁 판정 */
export function resolveConflict(state: GameState, p: PlayerState): void {
  const c = p.conflict;
  if (!c) return;
  p.conflict = null;
  const t = state.players[c.target];
  if (defenseLeft(p) < CONFLICT_DEFENSE) {
    p.res.culture = Math.max(0, p.res.culture - CONFLICT_FAIL_CULTURE);
    log(state, p.id, `방위 행동 부족으로 분쟁 취소: 문화 −${CONFLICT_FAIL_CULTURE}`);
    return;
  }
  p.defenseUsed += CONFLICT_DEFENSE;
  const d = attackValue(p, t) + c.atk - defenseValue(t);
  if (d <= 0) {
    p.res.culture = Math.max(0, p.res.culture - CONFLICT_FAIL_CULTURE);
    log(state, p.id, `${t.name}와의 분쟁 패배: 문화 −${CONFLICT_FAIL_CULTURE}`);
    return;
  }
  t.harmedRound = state.round;
  if (c.loss === 'culture') {
    const lost = Math.min(t.res.culture, Math.min(2 * d, CONFLICT_CULTURE_MAX));
    t.res.culture -= lost;
    p.res.culture += Math.floor(lost / 2);
    log(state, p.id, `${t.name}와의 분쟁 승리: 상대 문화 −${lost}, 내 문화 +${Math.floor(lost / 2)}`);
  } else if (c.loss === 'building') {
    const n = Math.ceil(d / 3);
    for (let i = 0; i < n; i++) downgradeBuilding(state, t);
    log(state, p.id, `${t.name}와의 분쟁 승리: 상대 건물 ${n}곳 하락`);
  } else {
    const main = mainDoctrine(t) ?? DOCTRINES.reduce((a, b) => (t.doctrine[b] > t.doctrine[a] ? b : a));
    const n = Math.ceil(d / 2);
    addDoctrine(state, t, main, -n);
    log(state, p.id, `${t.name}와의 분쟁 승리: 상대 노선 점수 −${n}`);
  }
}
