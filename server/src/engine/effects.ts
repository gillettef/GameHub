import { activeSide, cards } from './cards';
import { GameError, addLog, emptyTokens, getPlayer } from './state';
import type { GameState, PlayerId, PlayerInstance, PlayerState } from './state';
import { TRACK_MAX, TRACK_MIN } from './types';
import type { Effect, Track } from './types';
import { assignUniform } from './uniforms';

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

function findInstance(player: PlayerState, instanceId: string): PlayerInstance {
  const inst = player.roster.find((p) => p.instanceId === instanceId);
  if (!inst) throw new GameError(`unknown roster player: ${instanceId}`);
  return inst;
}

function candidatesFor(player: PlayerState, effect: Effect): string[] | null {
  switch (effect.type) {
    case 'trainPlayer':
      return player.roster.filter((p) => !p.trained).map((p) => p.instanceId);
    case 'placeStamina':
    case 'addPlayerToken':
      return player.roster.map((p) => p.instanceId);
    case 'removePlayerToken':
      return player.roster.filter((p) => p.tokens[effect.token] > 0).map((p) => p.instanceId);
    default:
      return null;
  }
}

function applyTargeted(player: PlayerState, effect: Effect, instance: PlayerInstance): void {
  switch (effect.type) {
    case 'trainPlayer':
      trainPlayer(player, instance);
      return;
    case 'placeStamina':
      instance.placed.stamina = (instance.placed.stamina ?? 0) + effect.count;
      return;
    case 'addPlayerToken':
      instance.tokens[effect.token] += effect.count;
      return;
    case 'removePlayerToken':
      instance.tokens[effect.token] = Math.max(0, instance.tokens[effect.token] - effect.count);
      return;
    default:
      throw new GameError(`effect ${effect.type} takes no target`);
  }
}

// 대상을 여러 번 고르는 효과(훈련 N명, spread 토큰 N개)는 1개씩 N번으로 나눈다
function targetedSteps(effect: Effect): { times: number; each: Effect } {
  if (effect.type === 'trainPlayer') return { times: effect.count, each: effect };
  if ((effect.type === 'addPlayerToken' || effect.type === 'removePlayerToken') && effect.spread) {
    const { spread, ...rest } = effect;
    void spread;
    return { times: effect.count, each: { ...rest, count: 1 } };
  }
  return { times: 1, each: effect };
}

// 대상 선택이 필요한 효과: 후보 0 → 무시, 1 → 자동 적용, 2+ → pending
export function applyEffects(state: GameState, pid: PlayerId, effects: readonly Effect[], source: string): void {
  const player = getPlayer(state, pid);
  for (const effect of effects) {
    const candidates = candidatesFor(player, effect);
    if (candidates) {
      const { times, each } = targetedSteps(effect);
      for (let i = 0; i < times; i++) {
        const cands = candidatesFor(player, each) ?? [];
        if (cands.length === 0) break;
        if (cands.length === 1) {
          applyTargeted(player, each, findInstance(player, cands[0]!));
        } else {
          player.pending.push({ id: `${source}#${player.pending.length}#${i}`, effect: each, source, candidates: cands });
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
        addLog(state, `${source}: 경기 외 득점 효과는 무시됨`, { actor: pid });
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

export function resolvePending(state: GameState, pid: PlayerId, pendingId: string, instanceId: string): void {
  const player = getPlayer(state, pid);
  const idx = player.pending.findIndex((p) => p.id === pendingId);
  if (idx < 0) throw new GameError(`unknown pending effect: ${pendingId}`);
  const pending = player.pending[idx]!;
  if (!pending.candidates.includes(instanceId)) throw new GameError('invalid target');
  applyTargeted(player, pending.effect, findInstance(player, instanceId));
  player.pending.splice(idx, 1);
  refreshPending(player);
}

// 앞선 선택으로 남은 대기 효과의 후보가 줄었을 수 있다 (약점 3개를 나눠 제거, 훈련 2명 등):
// 후보를 다시 계산해 0이면 버리고 1이면 자동 적용한다
function refreshPending(player: PlayerState): void {
  for (const p of [...player.pending]) {
    const cands = candidatesFor(player, p.effect) ?? [];
    if (cands.length >= 2) {
      p.candidates = cands;
      continue;
    }
    player.pending.splice(player.pending.indexOf(p), 1);
    if (cands.length === 1) applyTargeted(player, p.effect, findInstance(player, cands[0]!));
  }
}
