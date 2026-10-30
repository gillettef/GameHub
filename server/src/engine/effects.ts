import { activeSide, cards, effectiveSkill, instanceName } from './cards';
import { discardFromMarket } from './market';
import { sponsorSource, tagged } from './labels';
import type { Rng } from './rng';
import { GameError, addLog, emptyTokens, getPlayer } from './state';
import type { GameState, MatchMods, PendingEffect, PendingTarget, PlayerId, PlayerInstance, PlayerState } from './state';
import { traitSum } from './traits';
import { regionSector } from './match';
import { TRACK_MAX, TRACK_MIN } from './types';
import type { Effect, MarketRow, MatchCondition, PlayerToken, Region, Sector, Track } from './types';
import { assignUniform, releaseUniformOf } from './uniforms';

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
    stamina: 0,
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
// 방출로 받는 돈: 2 + 현재 역량, 부상·출장정지면 절반(내림) + 특성 보너스. 확정 막대의 미리 보기도 같은 함수를 쓴다
export function releaseValue(player: Pick<PlayerState, 'staff' | 'executives'>, inst: PlayerInstance): number {
  let money = 2 + effectiveSkill(inst);
  if (inst.tokens.injury > 0 || inst.tokens.suspension > 0) money = Math.floor(money / 2);
  return money + traitSum(player, 'releaseBonus'); // 특성: 방출 시 돈 +N
}

export function releaseFromRoster(state: GameState, player: PlayerState, inst: PlayerInstance): number {
  const idx = player.roster.indexOf(inst);
  if (idx < 0) throw new GameError('no such player');
  const money = releaseValue(player, inst);
  player.resources.money += money;
  player.vp += inst.careerVP;
  player.roster.splice(idx, 1);
  releaseUniformOf(player, inst);
  discardPlayerCard(state, inst.cardId);
  return money;
}

// 선수 카드는 종류별 버린 더미로 (주전·베테랑은 더미가 비면 다시 섞이고, 유망주는 섞이지 않는다)
export function discardPlayerCard(state: GameState, cardId: string): void {
  const kind = cards.player(cardId).kind;
  const pile = kind === 'veteran' ? state.decks.discards.veterans : kind === 'prospect' ? state.decks.discards.prospects : state.decks.discards.players;
  pile.push(cardId);
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
  placements: Record<string, Region>; // 필드 토큰 id → 지역
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
function candidatesFor(state: GameState, player: PlayerState, effect: Effect, ctx: EffectContext): { target: PendingTarget; candidates: string[]; row?: MarketRow } | null {
  const players = (ids: string[]) => ({ target: 'player' as const, candidates: ids });
  // target: 'self' — 효과를 가진 선수 카드 자신만 후보 (출처 카드가 없거나 조건에 안 맞으면 후보 0 = 무시)
  const self = (eligible: (p: PlayerInstance) => boolean) => players(ctx.inst && player.roster.includes(ctx.inst) && eligible(ctx.inst) ? [ctx.inst.instanceId] : []);
  switch (effect.type) {
    case 'trainPlayer':
      if (effect.target === 'self') return self((p) => !p.trained);
      return players(player.roster.filter((p) => !p.trained && (effect.only !== 'prospect' || cards.player(p.cardId).kind === 'prospect')).map((p) => p.instanceId));
    case 'placeStamina':
    case 'releasePlayer':
      return players(player.roster.map((p) => p.instanceId));
    case 'addPlayerToken': {
      if (effect.target === 'self') return self(() => true);
      if (effect.only === 'playedAttack') {
        const played = new Set(ctx.played ?? []);
        return players(player.roster.filter((p) => played.has(p.instanceId) && activeSide(p).role === 'attack').map((p) => p.instanceId));
      }
      return players(player.roster.map((p) => p.instanceId));
    }
    case 'removePlayerToken':
      if (effect.target === 'self') return self((p) => p.tokens[effect.token] > 0);
      return players(player.roster.filter((p) => p.tokens[effect.token] > 0).map((p) => p.instanceId));
    case 'addStaffSuspension': {
      const all = player.staff.map((_, i) => String(i));
      const clean = all.filter((i) => player.staff[Number(i)]!.suspension === 0);
      return { target: 'staff', candidates: effect.unsuspendedFirst && clean.length > 0 ? clean : all };
    }
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
    case 'trainPlayer': {
      const inst = findInstance(player, choice);
      trainPlayer(player, inst);
      for (const [token, n] of Object.entries(effect.withTokens ?? {}) as [PlayerToken, number][]) inst.tokens[token] += n;
      return;
    }
    case 'placeStamina': {
      findInstance(player, choice).stamina += effect.count;
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
      addLog(state, tagged('선수', `방출: ${instanceName(inst)} (+${money}돈)`), { actor: player.id });
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
      addLog(state, tagged('이적 시장', `카드 버림: ${marketCardName(effect.row, dropped)}`), { actor: player.id });
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

// 대상이 없을 때 기록에 남길 말
const NO_TARGET: Partial<Record<Effect['type'], string>> = {
  trainPlayer: '훈련할 수 있는 선수',
  addPlayerToken: '토큰을 받을 선수(조건에 맞는 선수 카드)',
  removePlayerToken: '그 토큰을 가진 선수',
  placeStamina: '선수 카드',
  releasePlayer: '방출할 선수',
  addStaffSuspension: '직원 카드',
  discardMarketCard: '이적 시장 카드',
  flipUnmatchedToken: '카드 없는 필드 유니폼 토큰',
};

function targetName(state: GameState, player: PlayerState, found: { target: PendingTarget; row?: MarketRow }, choice: string): string {
  if (found.target === 'staff') return cards.staff(player.staff[Number(choice)]?.cardId ?? '').name;
  if (found.target === 'market') return marketCardName(found.row ?? 'players', state.market[found.row ?? 'players'][Number(choice)] ?? '');
  if (found.target === 'token') return `유니폼 토큰 ${player.uniforms.find((u) => u.id === choice)?.number ?? '∅'}`;
  return instanceName(findInstance(player, choice));
}

export function marketCardName(row: MarketRow, cardId: string): string {
  return row === 'players' || row === 'veterans' ? cards.player(cardId).name : row === 'staff' ? cards.staff(cardId).name : cards.sponsor(cardId).name;
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
      return !!token && !!match.placements[token.id] && regionSector(match.placements[token.id]!) === cond.sector;
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
        if (found.candidates.length === 0) {
          // 아무 표시 없이 지나가면 효과가 고장 난 것처럼 보인다 (전술 카드 '역습'에 출전 공격 선수 카드가 없을 때 등)
          if (i === 0) addLog(state, `${source}: ${NO_TARGET[effect.type] ?? '고를 수 있는 대상'}이(가) 없어 효과 없음`, { actor: pid });
          break;
        }
        if (found.candidates.length === 1) {
          const name = targetName(state, player, found, found.candidates[0]!); // 방출·버리기는 적용하면 사라지므로 먼저 읽는다
          applyTargeted(state, player, each, found.candidates[0]!, rng ?? noRng());
          addLog(state, `${source}: 대상이 하나뿐이라 ${name}에 바로 적용`, { actor: pid });
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
        player.passives = player.passives.filter((p) => p.source !== sponsorSource(card));
        addLog(state, `${source}: 유니폼 스폰서 ${card.name} 계약 파기 → 장내 방송 효과로 보상`, { actor: pid });
        applyEffects(state, pid, card.kit, sponsorSource(card), ctx, rng);
        break;
      }
      case 'passive':
        player.passives.push({ passive: effect.passive, source });
        break;
      case 'upkeepDiscount':
        player.upkeepDiscount += effect.amount;
        break;
      case 'rollDie':
        // 시스템이 몰래 굴리지 않는다 (사용자 요청 2026-09: "굴려졌는지 알기 어렵다"): 대기 효과로 쌓아 두고 참가자가 직접 굴린다 — resolveDie
        player.pending.push({ id: `${source}#${player.pending.length}#die`, effect, source, target: 'die', candidates: ['roll'], instId: ctx.inst?.instanceId });
        addLog(state, `${source}: 주사위를 굴려야 함 (${effect.atMost} 이하면 적용)`, { actor: pid });
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
  const existed = player.pending.some((p) => p.id === pendingId);
  // 그새 선수를 방출·훈련해 후보가 사라졌을 수 있다: 먼저 후보를 다시 계산해 무효가 된 대기 효과는 정리한다.
  // (그대로 두면 고를 수 있는 대상이 없어 이 참가자에서 금요일 진행이 영원히 멈춘다)
  const dieId = player.pending.find((p) => p.id === pendingId)?.target === 'die';
  if (existed && !dieId) {
    refreshPending(state, player, rng);
    if (!player.pending.some((p) => p.id === pendingId)) return; // 후보가 없어 정리됐거나 하나뿐이라 자동 적용됨
  }
  const idx = player.pending.findIndex((p) => p.id === pendingId);
  if (idx < 0) throw new GameError(`unknown pending effect: ${pendingId}`);
  const pending = player.pending[idx]!;
  if (!pending.candidates.includes(choice)) throw new GameError('invalid target');
  if (pending.target === 'die') {
    resolveDie(state, player, pending, choice, rng);
    return;
  }
  applyTargeted(state, player, pending.effect, choice, rng);
  player.pending.splice(idx, 1);
  refreshPending(state, player, rng);
}

// 카드 효과 주사위 (rollDie): roll = 굴림 → 눈을 보여 주고 apply(결과 적용) 또는 reroll(팬덤 1개로 재굴림, p.12 — 자기 주사위)
function resolveDie(state: GameState, player: PlayerState, pending: PendingEffect, choice: string, rng: Rng): void {
  const effect = pending.effect;
  if (effect.type !== 'rollDie') throw new GameError('not a die effect');
  const outcome = (face: number) => (face <= effect.atMost ? '적용' : effect.otherwise?.length ? '대신 다른 효과' : '적용 안 함');
  const options = () => (player.resources.fandom >= 1 ? ['apply', 'reroll'] : ['apply']);
  if (choice === 'roll' || choice === 'reroll') {
    if (choice === 'reroll') {
      if (player.resources.fandom < 1) throw new GameError('not enough fandom to reroll');
      player.resources.fandom -= 1;
    }
    pending.roll = rng.die(6);
    pending.candidates = options();
    addLog(state, `${pending.source}: ${choice === 'reroll' ? '팬덤 1개로 다시 굴림 → ' : ''}주사위 ${pending.roll} (${effect.atMost} 이하면 적용) → ${outcome(pending.roll)}`, { actor: player.id });
    return;
  }
  const face = pending.roll!;
  player.pending.splice(player.pending.indexOf(pending), 1);
  const inst = pending.instId ? player.roster.find((r) => r.instanceId === pending.instId) : undefined;
  applyEffects(state, player.id, face <= effect.atMost ? effect.effects : (effect.otherwise ?? []), pending.source, { inst }, rng);
  refreshPending(state, player, rng);
}

// 앞선 선택으로 남은 대기 효과의 후보가 줄었을 수 있다 (약점 3개를 나눠 제거, 훈련 2명 등):
// 후보를 다시 계산해 0이면 버리고 1이면 자동 적용한다. 원래 후보 밖으로 넓어지지는 않는다(출전 공격수 한정 등 맥락 필터 유지)
function refreshPending(state: GameState, player: PlayerState, rng: Rng): void {
  for (const p of [...player.pending]) {
    if (p.target === 'die') continue; // 주사위 대기 효과는 후보 계산 대상이 아니다
    // 출전 공격수 한정(only: 'playedAttack')은 경기 맥락이 있어야 후보가 나온다. 원래 후보가 곧 출전 선수였으므로 그것을 맥락으로 준다
    // (빈 맥락으로 다시 계산하면 후보가 0이 되어 남은 선택이 말없이 사라졌다)
    const found = candidatesFor(state, player, p.effect, { played: p.candidates });
    // 유지비 미납(unsuspendedFirst)은 앞선 선택으로 '출장정지 없는 직원'이 바뀌므로 후보를 새로 계산한 그대로 쓴다
    const keepAll = p.effect.type === 'addStaffSuspension' && p.effect.unsuspendedFirst;
    const cands = (found?.candidates ?? []).filter((c) => keepAll || p.candidates.includes(c));
    if (cands.length >= 2) {
      p.candidates = cands;
      continue;
    }
    player.pending.splice(player.pending.indexOf(p), 1);
    if (cands.length === 1) applyTargeted(state, player, p.effect, cands[0]!, rng);
  }
}
