import { cards, effectiveSkill } from './cards';
import { addToRoster, applyEffects } from './effects';
import { startFriday } from './friday';
import { takeFromMarket } from './market';
import type { Rng } from './rng';
import { GameError, WEEKDAYS, getPlayer, leftOf } from './state';
import type { GameState, PlayerId, PlayerState } from './state';
import { INFRASTRUCTURE_COST, INFRASTRUCTURE_MAX } from './types';
import type { Cost, Effect, InfrastructureType, SponsorContract } from './types';
import { releaseUniform } from './uniforms';

const PAID_ACTION_OPS = 2;
const BILLBOARD_BASE_LIMIT = 2;

export function startWeekday(state: GameState): void {
  state.phase = { kind: 'weekday', day: 'tue', current: state.firstPlayer, basicDone: false, paidDone: false };
}

function turnOf(state: GameState, pid: PlayerId) {
  if (state.phase.kind !== 'weekday') throw new GameError('not a weekday');
  if (state.phase.current !== pid) throw new GameError('not your turn');
  return state.phase;
}

function requireBasic(state: GameState, pid: PlayerId) {
  const turn = turnOf(state, pid);
  if (turn.basicDone) throw new GameError('basic action already taken today');
  return turn;
}

function pay(player: PlayerState, cost: Cost): void {
  for (const [r, n] of Object.entries(cost) as [keyof Cost, number][]) {
    if (player.resources[r] < n) throw new GameError(`not enough ${r}`);
  }
  for (const [r, n] of Object.entries(cost) as [keyof Cost, number][]) player.resources[r] -= n;
}

// p.15 선수 영입: 맨 오른쪽 3장 중 1장
export function recruitPlayer(state: GameState, pid: PlayerId, marketIndex: number, rng: Rng): GameState {
  const next = structuredClone(state);
  const turn = requireBasic(next, pid);
  const player = getPlayer(next, pid);
  const cardId = next.market.players[marketIndex];
  if (cardId === undefined) throw new GameError('no such market card');
  pay(player, { money: cards.player(cardId).untrained.cost });
  takeFromMarket(next, 'players', marketIndex, rng);
  addToRoster(player, cardId);
  turn.basicDone = true;
  return next;
}

// p.15 유망주 영입: 더미 맨 위
export function recruitProspect(state: GameState, pid: PlayerId): GameState {
  const next = structuredClone(state);
  const turn = requireBasic(next, pid);
  const player = getPlayer(next, pid);
  const cardId = next.decks.prospects[0];
  if (!cardId) throw new GameError('prospect deck empty');
  pay(player, { money: cards.player(cardId).untrained.cost });
  next.decks.prospects.shift();
  addToRoster(player, cardId);
  turn.basicDone = true;
  return next;
}

// p.16 방출: 2돈 + 현재 역량, 부상/출장정지면 절반(내림), 카드 위 승점 토큰 획득
export function releasePlayer(state: GameState, pid: PlayerId, instanceId: string): GameState {
  const next = structuredClone(state);
  const turn = requireBasic(next, pid);
  const player = getPlayer(next, pid);
  const idx = player.roster.findIndex((p) => p.instanceId === instanceId);
  if (idx < 0) throw new GameError('no such player');
  const inst = player.roster[idx]!;
  let money = 2 + effectiveSkill(inst);
  if (inst.tokens.injury > 0 || inst.tokens.suspension > 0) money = Math.floor(money / 2);
  player.resources.money += money;
  player.vp += inst.careerVP;
  player.roster.splice(idx, 1);
  releaseUniform(player.uniforms, instanceId);
  next.decks.discards.players.push(inst.cardId);
  turn.basicDone = true;
  return next;
}

// p.17 직원 고용
export function hireStaff(state: GameState, pid: PlayerId, marketIndex: number, rng: Rng): GameState {
  const next = structuredClone(state);
  const turn = requireBasic(next, pid);
  const player = getPlayer(next, pid);
  const cardId = next.market.staff[marketIndex];
  if (cardId === undefined) throw new GameError('no such market card');
  const card = cards.staff(cardId);
  pay(player, { money: card.cost });
  takeFromMarket(next, 'staff', marketIndex, rng);
  player.staff.push({ cardId, exhausted: false, suspension: 0 });
  if (card.bonus) applyEffects(next, pid, card.bonus, card.name);
  turn.basicDone = true;
  return next;
}

export function billboardLimit(player: Pick<PlayerState, 'infrastructure'>): number {
  return BILLBOARD_BASE_LIMIT + (player.infrastructure.includes('billboard3') ? 1 : 0);
}

// p.18 스폰서 계약. 광고판은 카드 효과 또는 추가 보너스 중 택1, 명명권은 둘 다
export function signSponsor(
  state: GameState,
  pid: PlayerId,
  marketIndex: number,
  contract: SponsorContract,
  rng: Rng,
  billboardChoice: 'effect' | 'bonus' = 'effect',
): GameState {
  const next = structuredClone(state);
  const turn = requireBasic(next, pid);
  const player = getPlayer(next, pid);
  const cardId = next.market.sponsors[marketIndex];
  if (cardId === undefined) throw new GameError('no such market card');
  const card = cards.sponsor(cardId);

  switch (contract) {
    case 'kit':
      takeFromMarket(next, 'sponsors', marketIndex, rng);
      applyEffects(next, pid, card.kit, card.name);
      next.decks.discards.sponsors.push(cardId);
      break;
    case 'billboard':
      if (player.sponsors.billboards.length >= billboardLimit(player)) throw new GameError('billboard slots full');
      takeFromMarket(next, 'sponsors', marketIndex, rng);
      player.sponsors.billboards.push(cardId);
      applyEffects(next, pid, billboardChoice === 'bonus' ? card.extraBonus : card.billboard, card.name);
      break;
    case 'naming':
      if (player.sponsors.naming) throw new GameError('naming sponsor already signed');
      takeFromMarket(next, 'sponsors', marketIndex, rng);
      player.sponsors.naming = cardId;
      applyEffects(next, pid, [...card.naming, ...card.extraBonus], card.name);
      break;
  }
  turn.basicDone = true;
  return next;
}

// p.19 기반 시설 건설: 3돈, 최대 7개, 관중석/광고판은 1개씩
export function buildInfrastructure(state: GameState, pid: PlayerId, type: InfrastructureType): GameState {
  const next = structuredClone(state);
  const turn = requireBasic(next, pid);
  const player = getPlayer(next, pid);
  const def = cards.boardData.infrastructure.find((i) => i.type === type);
  if (!def) throw new GameError(`unknown infrastructure: ${type}`);
  if (player.infrastructure.length >= INFRASTRUCTURE_MAX) throw new GameError('stadium full');
  if (def.unique && player.infrastructure.includes(type)) throw new GameError(`${type} already built`);
  if (def.requires && !player.infrastructure.includes(def.requires)) throw new GameError(`${type} requires ${def.requires}`);
  pay(player, { money: INFRASTRUCTURE_COST });
  player.infrastructure.push(type);
  applyEffects(next, pid, def.bonus, def.name);
  turn.basicDone = true;
  return next;
}

// p.19 사무실 건설
export function buildOffice(state: GameState, pid: PlayerId): GameState {
  const next = structuredClone(state);
  const turn = requireBasic(next, pid);
  const player = getPlayer(next, pid);
  const steps = cards.boardData.office;
  if (player.office >= steps.length - 1) throw new GameError('office track complete');
  pay(player, { money: steps[player.office]!.cost });
  player.office++;
  turn.basicDone = true;
  return next;
}

export type CardActionSource = { kind: 'staff'; index: number } | { kind: 'executive'; index: number };

// p.19 카드 행동: 카드 소진(주 1회). p.14 추가 유급 행동: 운영 2개로 카드 행동 1회 더
export function cardAction(state: GameState, pid: PlayerId, source: CardActionSource, paid = false): GameState {
  const next = structuredClone(state);
  const turn = turnOf(next, pid);
  if (paid ? turn.paidDone : turn.basicDone) throw new GameError(paid ? 'paid action already taken today' : 'basic action already taken today');
  const player = getPlayer(next, pid);

  let holder: { cardId: string; exhausted: boolean };
  let action: { cost: Cost; effects: readonly Effect[] } | undefined;
  let name: string;
  if (source.kind === 'staff') {
    const staff = player.staff[source.index];
    if (!staff) throw new GameError('no such card');
    if (staff.suspension > 0) throw new GameError('card is suspended');
    const card = cards.staff(staff.cardId);
    holder = staff;
    action = card.action;
    name = card.name;
  } else {
    const exec = player.executives[source.index];
    if (!exec) throw new GameError('no such card');
    const card = cards.executive(exec.cardId);
    holder = exec;
    action = card.action;
    name = card.name;
  }
  if (holder.exhausted) throw new GameError('card already used this week');
  if (!action) throw new GameError('card has no action');

  pay(player, paid ? { ...action.cost, ops: (action.cost.ops ?? 0) + PAID_ACTION_OPS } : action.cost);
  holder.exhausted = true;
  applyEffects(next, pid, action.effects, name);
  if (paid) turn.paidDone = true;
  else turn.basicDone = true;
  return next;
}

export function pass(state: GameState, pid: PlayerId): GameState {
  const next = structuredClone(state);
  requireBasic(next, pid).basicDone = true;
  return next;
}

// 기본 행동(또는 패스) 후 차례 종료. 전원 마치면 다음 요일, 목요일이 끝나면 경기일
export function endTurn(state: GameState, pid: PlayerId): GameState {
  const next = structuredClone(state);
  const turn = turnOf(next, pid);
  if (!turn.basicDone) throw new GameError('take a basic action or pass first');
  const nextPlayer = leftOf(next, pid);
  if (nextPlayer !== next.firstPlayer) {
    next.phase = { ...turn, current: nextPlayer, basicDone: false, paidDone: false };
    return next;
  }
  const dayIdx = WEEKDAYS.indexOf(turn.day);
  const nextDay = WEEKDAYS[dayIdx + 1];
  if (nextDay) next.phase = { kind: 'weekday', day: nextDay, current: next.firstPlayer, basicDone: false, paidDone: false };
  else startFriday(next);
  return next;
}

