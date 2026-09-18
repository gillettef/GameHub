import { cards } from './cards';
import { resolvePending } from './effects';
import { acceptMatchRoll, rerollMatchDie, rollMatchDie, submitLineup } from './friday';
import { CONTRACT_LABEL, INFRA_LABEL, matchDieLabel } from './labels';
import { acceptBoardRoll, rerollBoardDie, rollBoardDie } from './monday';
import type { Rng } from './rng';
import { chooseObjective, draftPick } from './setup';
import { GameError, canUndoTurn, currentDay, getPlayer } from './state';
import type { GameState, LineupSubmission, LogEntry, PlayerId } from './state';
import type { InfrastructureType, SponsorContract } from './types';
import {
  buildInfrastructure,
  buildOffice,
  cardAction,
  endTurn,
  hireStaff,
  pass,
  recruitPlayer,
  recruitProspect,
  releasePlayer,
  signSponsor,
} from './weekday';
import type { CardActionSource } from './weekday';

export type GameAction =
  | { type: 'draftPick'; cardId: string }
  | { type: 'chooseObjective'; cardId: string }
  | { type: 'resolvePending'; pendingId: string; instanceId: string }
  | { type: 'rollBoardDie' }
  | { type: 'rerollBoardDie' }
  | { type: 'acceptBoardRoll' }
  | { type: 'recruitPlayer'; marketIndex: number }
  | { type: 'recruitProspect' }
  | { type: 'releasePlayer'; instanceId: string }
  | { type: 'hireStaff'; marketIndex: number }
  | { type: 'signSponsor'; marketIndex: number; contract: SponsorContract; billboardChoice?: 'effect' | 'bonus' }
  | { type: 'buildInfrastructure'; infrastructure: InfrastructureType }
  | { type: 'buildOffice' }
  | { type: 'cardAction'; source: CardActionSource; paid?: boolean }
  | { type: 'pass' }
  | { type: 'endTurn' }
  | { type: 'submitLineup'; submission: LineupSubmission }
  | { type: 'rollMatchDie' }
  | { type: 'rerollMatchDie' }
  | { type: 'acceptMatchRoll' }
  | { type: 'undoTurn' }; // 주중 내 차례를 처음 상태로 되돌린다 (차례 끝내기 전까지)

function apply(state: GameState, pid: PlayerId, action: GameAction, rng: Rng): GameState {
  switch (action.type) {
    case 'draftPick':
      return draftPick(state, pid, action.cardId);
    case 'chooseObjective':
      return chooseObjective(state, pid, action.cardId);
    case 'resolvePending': {
      const next = structuredClone(state);
      resolvePending(next, pid, action.pendingId, action.instanceId);
      return next;
    }
    case 'rollBoardDie':
      return rollBoardDie(state, pid, rng);
    case 'rerollBoardDie':
      return rerollBoardDie(state, pid, rng);
    case 'acceptBoardRoll':
      return acceptBoardRoll(state, pid);
    case 'recruitPlayer':
      return recruitPlayer(state, pid, action.marketIndex, rng);
    case 'recruitProspect':
      return recruitProspect(state, pid);
    case 'releasePlayer':
      return releasePlayer(state, pid, action.instanceId);
    case 'hireStaff':
      return hireStaff(state, pid, action.marketIndex, rng);
    case 'signSponsor':
      return signSponsor(state, pid, action.marketIndex, action.contract, rng, action.billboardChoice);
    case 'buildInfrastructure':
      return buildInfrastructure(state, pid, action.infrastructure);
    case 'buildOffice':
      return buildOffice(state, pid);
    case 'cardAction':
      return cardAction(state, pid, action.source, action.paid ?? false);
    case 'pass':
      return pass(state, pid);
    case 'endTurn':
      return endTurn(state, pid);
    case 'submitLineup':
      return submitLineup(state, pid, action.submission, rng);
    case 'rollMatchDie':
      return rollMatchDie(state, pid, rng);
    case 'rerollMatchDie':
      return rerollMatchDie(state, pid, rng);
    case 'acceptMatchRoll':
      return acceptMatchRoll(state, pid, rng);
    case 'undoTurn':
      return undoTurn(state, pid);
    default:
      throw new GameError(`unknown action: ${(action as { type: string }).type}`);
  }
}

// 공개 행동 기록. 비공개 정보(드래프트 카드, 목표 카드, 라인업 내용)는 드러내지 않는다
function describe(before: GameState, after: GameState, pid: PlayerId, action: GameAction): string | null {
  const player = getPlayer(before, pid);
  const playerName = (instanceId: string) => {
    const inst = player.roster.find((r) => r.instanceId === instanceId);
    return inst ? cards.player(inst.cardId).name : instanceId;
  };
  switch (action.type) {
    case 'draftPick':
      return '임원 카드를 골랐다';
    case 'chooseObjective':
      return '목표 카드를 골랐다';
    case 'resolvePending': {
      const pending = player.pending.find((p) => p.id === action.pendingId);
      return `${pending?.source ?? '효과'} → ${playerName(action.instanceId)}`;
    }
    case 'rollBoardDie':
    case 'rerollBoardDie': {
      const roll = after.phase.kind === 'monday.board' ? after.phase.meetings[pid]?.roll : null;
      return `${action.type === 'rerollBoardDie' ? '팬덤을 써서 다시 굴림' : '이사회 주사위'} → ${roll}`;
    }
    case 'acceptBoardRoll':
      return null; // monday.ts 가 결정 내용을 기록
    case 'recruitPlayer': {
      const id = before.market.players[action.marketIndex];
      return id ? `영입: ${cards.player(id).name}` : '영입';
    }
    case 'recruitProspect':
      return '유망주 영입';
    case 'releasePlayer':
      return `방출: ${playerName(action.instanceId)}`;
    case 'hireStaff': {
      const id = before.market.staff[action.marketIndex];
      return id ? `고용: ${cards.staff(id).name}` : '고용';
    }
    case 'signSponsor': {
      const id = before.market.sponsors[action.marketIndex];
      return `${CONTRACT_LABEL[action.contract]} 계약: ${id ? cards.sponsor(id).name : ''}`;
    }
    case 'buildInfrastructure':
      return `건설: ${INFRA_LABEL[action.infrastructure]}`;
    case 'buildOffice':
      return `사무실 확장 → ${getPlayer(after, pid).office}단계`;
    case 'cardAction': {
      const holder = action.source.kind === 'staff' ? player.staff[action.source.index] : player.executives[action.source.index];
      const name = holder ? (action.source.kind === 'staff' ? cards.staff(holder.cardId).name : cards.executive(holder.cardId).name) : '카드';
      return `${name} 행동${action.paid ? ' (유급)' : ''}`;
    }
    case 'pass':
      return '패스';
    case 'endTurn':
      return null;
    case 'submitLineup': {
      const f = cards.tactic(action.submission.tacticCardId).formations[action.submission.formationIndex];
      return `라인업 제출 (${f ? `${f.defenders}-${f.midfielders}-${f.forwards}` : ''}, 출전 ${action.submission.players.length}명)`;
    }
    case 'rollMatchDie':
    case 'rerollMatchDie': {
      const roll = after.phase.kind === 'friday.aftermath' ? after.phase.matches[pid]?.roll : null;
      return `${action.type === 'rerollMatchDie' ? '팬덤을 써서 다시 굴림' : '경기 영향 주사위'} → ${roll}`;
    }
    case 'acceptMatchRoll': {
      const m = before.phase.kind === 'friday.aftermath' ? before.phase.matches[pid] : undefined;
      return m?.roll ? `경기 영향 적용: ${matchDieLabel(m.report.outcome, m.roll)}` : null;
    }
    case 'undoTurn':
      return '차례를 처음으로 되돌림';
  }
}

// 주중 차례의 첫 행동 직전에 상태를 찍어 둔다. 주중이 아니면 묵은 스냅샷을 버린다
function withTurnSnapshot(state: GameState, pid: PlayerId): GameState {
  if (state.phase.kind !== 'weekday' || state.phase.current !== pid) {
    if (!state.turnSnapshot) return state;
    const { turnSnapshot, ...rest } = state;
    void turnSnapshot;
    return rest;
  }
  if (canUndoTurn(state, pid)) return state;
  const { turnSnapshot, ...rest } = state;
  void turnSnapshot;
  return { ...rest, turnSnapshot: { pid, week: state.week, day: state.phase.day, state: structuredClone(rest) } };
}

export function undoTurn(state: GameState, pid: PlayerId): GameState {
  if (state.phase.kind !== 'weekday') throw new GameError('undo only during weekdays');
  if (state.phase.current !== pid) throw new GameError('not your turn');
  if (!canUndoTurn(state, pid)) throw new GameError('nothing to undo');
  return structuredClone(state.turnSnapshot!.state);
}

export function applyAction(state: GameState, pid: PlayerId, action: GameAction, rng: Rng): GameState {
  getPlayer(state, pid);
  const base = action.type === 'undoTurn' ? state : withTurnSnapshot(state, pid);
  const next = apply(base, pid, action, rng);
  const text = describe(state, next, pid, action);
  if (text) {
    // 행동 당시의 주차·요일로 기록하고, 행동이 낳은 후속 기록(경기 결과, 주말 정산 등)보다 앞에 둔다
    const entry: LogEntry = { id: 0, week: state.week, day: currentDay(state), actor: pid, text };
    next.log.splice(state.log.length, 0, entry);
    next.log.forEach((l, i) => (l.id = i + 1));
  }
  return next;
}
