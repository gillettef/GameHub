import { cards } from './cards';
import { addToRoster, applyEffects, releaseFromRoster } from './effects';
import { startFriday } from './friday';
import { takeFromMarket } from './market';
import type { Rng } from './rng';
import { GameError, WEEKDAYS, addLog, getPlayer, leftOf } from './state';
import type { GameState, PlayerId, PlayerState, Weekday } from './state';
import { hireCost, infraCost, marketMinIndex, prospectCost, traitSum } from './traits';
import { INFRASTRUCTURE_MAX } from './types';
import type { Cost, DayRestriction, Effect, InfrastructureType, SponsorContract } from './types';

const PAID_ACTION_OPS = 2;
const BILLBOARD_BASE_LIMIT = 2;

// 이사회 효과의 요일 제한 (점검용 토큰): 그 주 그 요일에 기본 행동 불가 / 카드 행동만
export function restrictionFor(player: Pick<PlayerState, 'restrictions'>, week: number, day: Weekday): DayRestriction | null {
  return player.restrictions.find((r) => r.week === week && r.day === day)?.mode ?? null;
}

// 참가자의 주중 차례 시작: 기본 행동이 막힌 날이면 기본 행동을 끝난 것으로 두고 기록한다 (차례 끝내기만 가능)
function beginTurn(state: GameState, day: Weekday, pid: PlayerId): void {
  const mode = restrictionFor(getPlayer(state, pid), state.week, day);
  state.phase = { kind: 'weekday', day, current: pid, basicDone: mode === 'noBasic', paidDone: false };
  if (mode === 'noBasic') addLog(state, '점검용 토큰: 오늘은 기본 행동을 할 수 없음', { actor: pid });
  else if (mode === 'cardActionOnly') addLog(state, '점검용 토큰: 오늘은 카드 행동만 할 수 있음', { actor: pid });
}

export function startWeekday(state: GameState): void {
  beginTurn(state, 'tue', state.firstPlayer);
}

function turnOf(state: GameState, pid: PlayerId) {
  if (state.phase.kind !== 'weekday') throw new GameError('not a weekday');
  if (state.phase.current !== pid) throw new GameError('not your turn');
  return state.phase;
}

function requireBasic(state: GameState, pid: PlayerId, kind: 'other' | 'cardAction' = 'other') {
  const turn = turnOf(state, pid);
  if (turn.basicDone) throw new GameError('basic action already taken today');
  const mode = restrictionFor(getPlayer(state, pid), state.week, turn.day);
  if (mode === 'noBasic') throw new GameError('no basic action today (board effect)');
  if (mode === 'cardActionOnly' && kind !== 'cardAction') throw new GameError('only card actions today (board effect)');
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
  takeFromMarket(next, 'players', marketIndex, rng, marketMinIndex(player, 'players'));
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
  pay(player, { money: prospectCost(player, cards.player(cardId).untrained.cost) });
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
  const inst = player.roster.find((p) => p.instanceId === instanceId);
  if (!inst) throw new GameError('no such player');
  releaseFromRoster(next, player, inst);
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
  pay(player, { money: hireCost(player, card.cost) });
  takeFromMarket(next, 'staff', marketIndex, rng);
  player.staff.push({ cardId, exhausted: false, suspension: 0 });
  if (card.bonus) applyEffects(next, pid, card.bonus, card.name, {}, rng);
  turn.basicDone = true;
  return next;
}

export function billboardLimit(player: Pick<PlayerState, 'infrastructure'>): number {
  return BILLBOARD_BASE_LIMIT + (player.infrastructure.includes('billboard3') ? 1 : 0);
}

// p.18 스폰서 계약. 광고판은 카드 효과 또는 추가 보너스 중 택1, 유니폼(naming)은 둘 다
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
      takeFromMarket(next, 'sponsors', marketIndex, rng, marketMinIndex(player, 'sponsors'));
      applyEffects(next, pid, card.kit, card.name, {}, rng);
      next.decks.discards.sponsors.push(cardId);
      break;
    case 'billboard':
      if (player.sponsors.billboards.length >= billboardLimit(player)) throw new GameError('billboard slots full');
      takeFromMarket(next, 'sponsors', marketIndex, rng, marketMinIndex(player, 'sponsors'));
      player.sponsors.billboards.push(cardId);
      applyEffects(next, pid, billboardChoice === 'bonus' ? card.extraBonus : card.billboard, card.name, {}, rng);
      break;
    case 'naming':
      if (player.sponsors.naming) throw new GameError('naming sponsor already signed');
      takeFromMarket(next, 'sponsors', marketIndex, rng, marketMinIndex(player, 'sponsors'));
      player.sponsors.naming = cardId;
      applyEffects(next, pid, [...card.naming, ...card.extraBonus], card.name, {}, rng);
      break;
  }
  const fandomBonus = traitSum(player, 'fandomOnSponsor'); // 특성: 스폰서 계약 시 팬덤
  if (fandomBonus > 0) player.resources.fandom += fandomBonus;
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
  pay(player, { money: infraCost(player) });
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
export function cardAction(state: GameState, pid: PlayerId, source: CardActionSource, paid: boolean, rng: Rng): GameState {
  const next = structuredClone(state);
  const turn = paid ? turnOf(next, pid) : requireBasic(next, pid, 'cardAction');
  if (paid && turn.paidDone) throw new GameError('paid action already taken today');
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
  applyEffects(next, pid, action.effects, name, {}, rng);
  if (paid) turn.paidDone = true;
  else turn.basicDone = true;
  return next;
}

// 패스는 요일 제한과 무관하게 가능 (기본 행동을 하지 않는 것이므로)
export function pass(state: GameState, pid: PlayerId): GameState {
  const next = structuredClone(state);
  const turn = turnOf(next, pid);
  if (turn.basicDone) throw new GameError('basic action already taken today');
  turn.basicDone = true;
  return next;
}

// 기본 행동(또는 패스) 후 차례 종료. 전원 마치면 다음 요일, 목요일이 끝나면 경기일
export function endTurn(state: GameState, pid: PlayerId): GameState {
  const next = structuredClone(state);
  const turn = turnOf(next, pid);
  if (!turn.basicDone) throw new GameError('take a basic action or pass first');
  const nextPlayer = leftOf(next, pid);
  if (nextPlayer !== next.firstPlayer) {
    beginTurn(next, turn.day, nextPlayer);
    return next;
  }
  const dayIdx = WEEKDAYS.indexOf(turn.day);
  const nextDay = WEEKDAYS[dayIdx + 1];
  if (nextDay) beginTurn(next, nextDay, next.firstPlayer);
  else startFriday(next);
  return next;
}

