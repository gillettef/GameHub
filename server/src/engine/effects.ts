import { activeSide, cards, effectiveSkill } from './cards';
import { discardFromMarket } from './market';
import type { Rng } from './rng';
import { GameError, addLog, emptyTokens, getPlayer } from './state';
import type { GameState, MatchMods, PendingTarget, PlayerId, PlayerInstance, PlayerState } from './state';
import { TRACK_MAX, TRACK_MIN } from './types';
import type { Effect, MatchCondition, Sector, Track } from './types';
import { assignUniform, releaseUniform } from './uniforms';

// p.7: 5를 넘기면 이동 대신 보드에 표시된 자원 획득, 1 아래로 내려가면 표시된 자원 손실 (트랙마다 다른 자원)
export function moveTrack(player: PlayerState, track: Track, delta: number): void {
  const target = player.tracks[track] + delta;
  const overflow = cards.boardData.trackOverflow[track];
  if (target > TRACK_MAX) {
    player.resources[overflow.above] += target - TRACK_MAX;
    player.tracks[track] = TRACK_MAX;
  } else if (target < TRACK_MIN) {
    player.resources[overflow.below] = Math.max(0, player.resources[overflow.below] - (TRACK_MIN - target));
    player.tracks[track] = TRACK_MIN;
  } else {
    player.tracks[track] = target;
  }
}

export function addToRoster(player: PlayerState, cardId: string): PlayerInstance {
  const instance: PlayerInstance = {
    instanceId: `${player.id}-pl${player.nextInstance++}`,
    cardId,
    trained: false,
    tokens: emptyTokens(),
    placed: {},
    exhausted: false,
    careerVP: 0,
    careerUsed: { appearances: 0, goals: 0 },
  };
  player.roster.push(instance);
  assignUniform(player.uniforms, instance.instanceId, activeSide(instance));
  return instance;
}

export function trainPlayer(player: PlayerState, instance: PlayerInstance): void {
  if (instance.trained) throw new GameError('already trained');
  instance.trained = true;
  assignUniform(player.uniforms, instance.instanceId, activeSide(instance));
}

// p.16 방출: 2돈 + 현재 역량, 부상/출장정지면 절반(내림), 카드 위 승점 토큰 획득. 주중 방출 행동과 카드 효과가 공유한다
export function releaseFromRoster(state: GameState, player: PlayerState, inst: PlayerInstance): number {
  const idx = player.roster.indexOf(inst);
  if (idx < 0) throw new GameError('no such player');
  let money = 2 + effectiveSkill(inst);
  if (inst.tokens.injury > 0 || inst.tokens.suspension > 0) money = Math.floor(money / 2);
  player.resources.money += money;
  player.vp += inst.careerVP;
  player.roster.splice(idx, 1);
  releaseUniform(player.uniforms, inst.instanceId);
  state.decks.discards.players.push(inst.cardId);
  return money;
}

function findInstance(player: PlayerState, instanceId: string): PlayerInstance {
  const inst = player.roster.find((p) => p.instanceId === instanceId);
  if (!inst) throw new GameError(`unknown roster player: ${instanceId}`);
  return inst;
}

// 경기 맥락. 경기 전(pre)에는 결과가 필요한 조건을 미룰 수 있고(deferred), 경기 후(post)에는 모두 판정한다
export interface MatchContext {
  stage: 'pre' | 'post';
  myGoals: number;
  theirGoals: number;
  sectorGoals: Partial<Record<Sector, number>>; // 내 구획별 득점 (post)
  placements: Record<string, Sector>; // 필드 토큰 id → 구획
  opponentTeamId: string;
}

// 효과 적용 맥락: 출전 선수(played), 경기 보정치 누적(mods), 경기 맥락(match), 효과를 가진 선수 카드(inst)
export interface EffectContext {
  played?: string[];
  mods?: MatchMods;
  match?: MatchContext;
  inst?: PlayerInstance;
}

// 대상 선택이 필요한 효과의 후보. null 이면 대상이 필요 없는 효과
function candidatesFor(state: GameState, player: PlayerState, effect: Effect, ctx: EffectContext): { target: PendingTarget; candidates: string[]; row?: 'players' | 'staff' | 'sponsors' } | null {
  const players = (ids: string[]) => ({ target: 'player' as const, candidates: ids });
  switch (effect.type) {
    case 'trainPlayer':
      return players(player.roster.filter((p) => !p.trained).map((p) => p.instanceId));
    case 'placeStamina':
    case 'releasePlayer':
      return players(player.roster.map((p) => p.instanceId));
    case 'addPlayerToken': {
      if (effect.only === 'playedAttack') {
        const played = new Set(ctx.played ?? []);
        return players(player.roster.filter((p) => played.has(p.instanceId) && activeSide(p).role === 'attack').map((p) => p.instanceId));
      }
      return players(player.roster.map((p) => p.instanceId));
    }
    case 'removePlayerToken':
      return players(player.roster.filter((p) => p.tokens[effect.token] > 0).map((p) => p.instanceId));
    case 'addStaffSuspension':
      return { target: 'staff', candidates: player.staff.map((_, i) => String(i)) };
    case 'discardMarketCard':
      return { target: 'market', candidates: state.market[effect.row].map((_, i) => String(i)), row: effect.row };
    case 'flipUnmatchedToken':
      return { target: 'token', candidates: player.uniforms.filter((u) => u.location === 'field' && !u.cardInstanceId).map((u) => u.id) };
    default:
      return null;
  }
}

function applyTargeted(state: GameState, player: PlayerState, effect: Effect, choice: string, rng: Rng): void {
  switch (effect.type) {
    case 'trainPlayer':
      trainPlayer(player, findInstance(player, choice));
      return;
    case 'placeStamina': {
      const inst = findInstance(player, choice);
      inst.placed.stamina = (inst.placed.stamina ?? 0) + effect.count;
      return;
    }
    case 'addPlayerToken':
      findInstance(player, choice).tokens[effect.token] += effect.count;
      return;
    case 'removePlayerToken': {
      const inst = findInstance(player, choice);
      inst.tokens[effect.token] = Math.max(0, inst.tokens[effect.token] - effect.count);
      return;
    }
    case 'releasePlayer': {
      const inst = findInstance(player, choice);
      const money = releaseFromRoster(state, player, inst);
      addLog(state, `방출: ${cards.player(inst.cardId).name} (+${money}돈)`, { actor: player.id });
      return;
    }
    case 'addStaffSuspension': {
      const staff = player.staff[Number(choice)];
      if (!staff) throw new GameError('no such staff');
      staff.suspension += effect.count;
      return;
    }
    case 'discardMarketCard': {
      const dropped = discardFromMarket(state, effect.row, Number(choice), rng);
      addLog(state, `이적 시장 카드 버림: ${marketCardName(effect.row, dropped)}`, { actor: player.id });
      return;
    }
    case 'flipUnmatchedToken': {
      const token = player.uniforms.find((u) => u.id === choice);
      if (!token) throw new GameError('no such token');
      token.face = token.face === 'attack' ? 'defense' : 'attack';
      return;
    }
    default:
      throw new GameError(`effect ${effect.type} takes no target`);
  }
}

export function marketCardName(row: 'players' | 'staff' | 'sponsors', cardId: string): string {
  return row === 'players' ? cards.player(cardId).name : row === 'staff' ? cards.staff(cardId).name : cards.sponsor(cardId).name;
}

// 대상을 여러 번 고르는 효과(훈련 N명, spread 토큰 N개, 토큰 뒤집기 N개)는 1개씩 N번으로 나눈다
function targetedSteps(effect: Effect): { times: number; each: Effect } {
  if (effect.type === 'trainPlayer' || effect.type === 'flipUnmatchedToken') return { times: effect.count, each: effect };
  if ((effect.type === 'addPlayerToken' || effect.type === 'removePlayerToken') && effect.spread) {
    const { spread, ...rest } = effect;
    void spread;
    return { times: effect.count, each: { ...rest, count: 1 } };
  }
  return { times: 1, each: effect };
}

// 경기 조건 판정. 경기 전에는 결과가 필요한 조건을 'defer'(경기 후 다시 판정)로 돌려준다
export function checkCondition(state: GameState, pid: PlayerId, cond: MatchCondition, match: MatchContext, inst?: PlayerInstance): boolean | 'defer' {
  switch (cond.kind) {
    case 'opponentHigherInLeague': {
      const opp = state.league.opponents.find((o) => o.teamId === match.opponentTeamId);
      return !!opp && opp.position > (state.league.players[pid] ?? 0);
    }
    case 'inSector': {
      if (!inst) return false;
      const token = getPlayer(state, pid).uniforms.find((u) => u.cardInstanceId === inst.instanceId);
      return !!token && match.placements[token.id] === cond.sector;
    }
    case 'outcome':
      if (match.stage === 'pre') return 'defer';
      return (match.myGoals > match.theirGoals ? 'win' : match.myGoals < match.theirGoals ? 'loss' : 'draw') === cond.outcome;
    case 'goalsAtLeast':
      return match.stage === 'pre' ? 'defer' : match.myGoals >= cond.goals;
    case 'cleanSheet':
      return match.stage === 'pre' ? 'defer' : match.theirGoals === 0;
    case 'scoredInSector':
      return match.stage === 'pre' ? 'defer' : (match.sectorGoals[cond.sector] ?? 0) > 0;
  }
}

// 대상 선택이 필요한 효과: 후보 0 → 무시, 1 → 자동 적용, 2+ → pending.
// 경기 관련 효과(득점·선방·구획 역량·득점 무효·조건부)는 ctx.mods 에 쌓여 경기 판정에 반영되고, 경기 밖에서는 기록만 남긴다
export function applyEffects(state: GameState, pid: PlayerId, effects: readonly Effect[], source: string, ctx: EffectContext = {}, rng?: Rng): void {
  const player = getPlayer(state, pid);
  const matchOnly = (e: Effect) => addLog(state, `${source}: 경기 중에만 적용되는 효과라 무시됨 (${e.type})`, { actor: pid });
  for (const effect of effects) {
    const targeted = candidatesFor(state, player, effect, ctx);
    if (targeted) {
      const { times, each } = targetedSteps(effect);
      for (let i = 0; i < times; i++) {
        const found = candidatesFor(state, player, each, ctx)!;
        if (found.candidates.length === 0) break;
        if (found.candidates.length === 1) {
          applyTargeted(state, player, each, found.candidates[0]!, rng ?? noRng());
        } else {
          player.pending.push({ id: `${source}#${player.pending.length}#${i}`, effect: each, source, target: found.target, candidates: found.candidates, row: found.row });
        }
      }
      continue;
    }
    switch (effect.type) {
      case 'gainResource':
        player.resources[effect.resource] = Math.max(0, player.resources[effect.resource] + effect.amount);
        break;
      case 'moveTrack':
        moveTrack(player, effect.track, effect.delta);
        break;
      case 'gainVP':
        player.vp = Math.max(0, player.vp + effect.amount);
        break;
      case 'drawTactic':
        for (let i = 0; i < effect.count; i++) {
          const card = state.decks.tactics.shift();
          if (card) player.tacticCards.push(card);
        }
        break;
      case 'recruitProspectFree': {
        const card = state.decks.prospects.shift();
        if (card) addToRoster(player, card);
        break;
      }
      case 'scoreGoal':
        if (!ctx.mods) matchOnly(effect);
        else if (effect.team === 'self') ctx.mods.mine = Math.max(0, ctx.mods.mine + effect.amount);
        else ctx.mods.theirs = Math.max(0, ctx.mods.theirs + effect.amount);
        break;
      case 'denyGoals':
        if (ctx.mods) ctx.mods.denyGoals += effect.count;
        else matchOnly(effect);
        break;
      case 'extraSaves':
        if (ctx.mods) ctx.mods.extraSaves += effect.count;
        else matchOnly(effect);
        break;
      case 'sectorSkill':
        if (ctx.mods) ctx.mods.sectorSkill[effect.sector] = (ctx.mods.sectorSkill[effect.sector] ?? 0) + effect.delta;
        else matchOnly(effect);
        break;
      case 'conditional': {
        if (!ctx.match) {
          matchOnly(effect);
          break;
        }
        const r = checkCondition(state, pid, effect.condition, ctx.match, ctx.inst);
        if (r === 'defer') {
          if (ctx.mods) ctx.mods.deferred.push({ source, effect, instanceId: ctx.inst?.instanceId });
        } else if (r) {
          applyEffects(state, pid, effect.effects, source, ctx, rng);
        }
        break;
      }
      case 'restrictDay': {
        const week = state.week + (effect.week === 'next' ? 1 : 0);
        player.restrictions.push({ week, day: effect.day, mode: effect.mode });
        addLog(state, `${source}: ${week}주차 ${{ tue: '화요일', wed: '수요일', thu: '목요일' }[effect.day]}에 ${effect.mode === 'noBasic' ? '기본 행동 불가' : '카드 행동만 가능'} (점검용 토큰)`, { actor: pid });
        break;
      }
      case 'breakNamingSponsor': {
        const naming = player.sponsors.naming;
        if (!naming) {
          applyEffects(state, pid, effect.otherwise, source, ctx, rng);
          break;
        }
        const card = cards.sponsor(naming);
        delete player.sponsors.naming;
        state.decks.discards.sponsors.push(naming);
        player.passives = player.passives.filter((p) => p.source !== card.name);
        addLog(state, `${source}: 유니폼 스폰서 ${card.name} 계약 파기 → 장내 방송 효과로 보상`, { actor: pid });
        applyEffects(state, pid, card.kit, card.name, ctx, rng);
        break;
      }
      case 'passive':
        player.passives.push({ passive: effect.passive, source });
        break;
      case 'upkeepDiscount':
        player.upkeepDiscount += effect.amount;
        break;
      case 'peekOpponent':
        if (player.opponentDeck.length === 0) {
          addLog(state, `${source}: 확인할 상대 팀 카드가 없음`, { actor: pid });
        } else {
          player.scouted = true; // 뷰가 본인에게만 앞면을 보여준다
          addLog(state, `${source}: 상대 팀 카드 더미 맨 위 카드를 확인함`, { actor: pid });
        }
        break;
      case 'text':
        addLog(state, `${source}: (수동 처리) ${effect.text}`, { actor: pid });
        break;
    }
  }
}

// 대상이 하나뿐인 시장 카드 버리기처럼 난수가 필요한 자동 적용에 rng 가 없으면 실패하게 한다 (호출부 실수 방지)
function noRng(): Rng {
  return {
    float: () => {
      throw new GameError('rng required');
    },
    int: () => {
      throw new GameError('rng required');
    },
    die: () => {
      throw new GameError('rng required');
    },
    shuffle: () => {
      throw new GameError('rng required');
    },
  };
}

export function resolvePending(state: GameState, pid: PlayerId, pendingId: string, choice: string, rng: Rng): void {
  const player = getPlayer(state, pid);
  const idx = player.pending.findIndex((p) => p.id === pendingId);
  if (idx < 0) throw new GameError(`unknown pending effect: ${pendingId}`);
  const pending = player.pending[idx]!;
  if (!pending.candidates.includes(choice)) throw new GameError('invalid target');
  applyTargeted(state, player, pending.effect, choice, rng);
  player.pending.splice(idx, 1);
  refreshPending(state, player, rng);
}

// 앞선 선택으로 남은 대기 효과의 후보가 줄었을 수 있다 (약점 3개를 나눠 제거, 훈련 2명 등):
// 후보를 다시 계산해 0이면 버리고 1이면 자동 적용한다. 원래 후보 밖으로 넓어지지는 않는다(출전 공격수 한정 등 맥락 필터 유지)
function refreshPending(state: GameState, player: PlayerState, rng: Rng): void {
  for (const p of [...player.pending]) {
    const found = candidatesFor(state, player, p.effect, {});
    const cands = (found?.candidates ?? []).filter((c) => p.candidates.includes(c));
    if (cands.length >= 2) {
      p.candidates = cands;
      continue;
    }
    player.pending.splice(player.pending.indexOf(p), 1);
    if (cands.length === 1) applyTargeted(state, player, p.effect, cands[0]!, rng);
  }
}
