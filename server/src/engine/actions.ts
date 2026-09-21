import { cards, instanceName } from './cards';
import { resolvePending } from './effects';
import { marketCardName } from './effects';
import { acceptInjuryRoll, acceptMatchRoll, advanceFriday, playTacticEffect, redrawTactic, rerollInjuryDie, rerollMatchDie, rollInjuryDie, rollMatchDie, submitLineup } from './friday';
import { CONTRACT_LABEL, INFRA_LABEL, matchDieLabel } from './labels';
import { acceptBoardRoll, rerollBoardDie, rollBoardDie } from './monday';
import type { Rng } from './rng';
import { chooseObjective, draftPick } from './setup';
import { UPKEEP_SOURCE } from './weekend';
import { GameError, canUndoTurn, currentDay, currentInjuryDie, getPlayer, hasTurnSnapshot } from './state';
import type { Decks, GameState, LineupSubmission, LogEntry, PlayerId } from './state';
import type { InfrastructureType, PlayerMarketRow, SponsorContract } from './types';
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
  | { type: 'resolvePending'; pendingId: string; choice: string } // choice: 대기 효과의 target 에 따라 선수 instanceId / 직원 index / 시장 index / 토큰 id
  | { type: 'rollBoardDie' }
  | { type: 'rerollBoardDie' }
  | { type: 'acceptBoardRoll' }
  | { type: 'recruitPlayer'; marketIndex: number; row?: PlayerMarketRow } // row 생략 = 주전 행. 'veterans' = 베테랑 행
  | { type: 'recruitProspect' } // 유망주 더미 맨 위 (미훈련 면 공개)
  | { type: 'releasePlayer'; instanceId: string }
  | { type: 'hireStaff'; marketIndex: number }
  | { type: 'signSponsor'; marketIndex: number; contract: SponsorContract; billboardChoice?: 'effect' | 'bonus' }
  | { type: 'buildInfrastructure'; infrastructure: InfrastructureType }
  | { type: 'buildOffice' }
  | { type: 'cardAction'; source: CardActionSource; paid?: boolean }
  | { type: 'pass' }
  | { type: 'endTurn' }
  | { type: 'submitLineup'; submission: LineupSubmission }
  | { type: 'playTacticEffect'; cardId: string | null } // 경기 진행: 전술 효과 카드 1장 (null = 쓰지 않음)
  | { type: 'redrawTactic'; cardId: string } // 특성: 경기 준비 중 전술 카드 1장을 버리고 새로 뽑기
  | { type: 'rollMatchDie' }
  | { type: 'rerollMatchDie' }
  | { type: 'acceptMatchRoll' }
  // 경기 영향이 부상류일 때의 12면체 부상 주사위 (p.24·p.27): 굴림 → 팬덤 재굴림 → 적용
  | { type: 'rollInjuryDie' }
  | { type: 'rerollInjuryDie' }
  | { type: 'acceptInjuryRoll' }
  | { type: 'undoTurn' }; // 주중 내 차례를 처음 상태로 되돌린다 (차례 끝내기 전까지)

function apply(state: GameState, pid: PlayerId, action: GameAction, rng: Rng): GameState {
  // 유지비 미납 출장정지를 놓을 직원을 고르기 전에는 다른 행동을 할 수 없다 (출장정지된 직원의 행동·특성을 먼저 써 버리지 못하게)
  if (action.type !== 'resolvePending' && state.players[pid]?.pending.some((p) => p.source === UPKEEP_SOURCE)) {
    throw new GameError('choose staff for unpaid upkeep first');
  }
  switch (action.type) {
    case 'draftPick':
      return draftPick(state, pid, action.cardId);
    case 'chooseObjective':
      return chooseObjective(state, pid, action.cardId);
    case 'resolvePending': {
      const next = structuredClone(state);
      resolvePending(next, pid, action.pendingId, action.choice, rng);
      advanceFriday(next, pid, rng); // 금요일 대상 선택이 끝났으면 차례를 넘긴다
      return next;
    }
    case 'rollBoardDie':
      return rollBoardDie(state, pid, rng);
    case 'rerollBoardDie':
      return rerollBoardDie(state, pid, rng);
    case 'acceptBoardRoll':
      return acceptBoardRoll(state, pid);
    case 'recruitPlayer':
      return recruitPlayer(state, pid, action.marketIndex, rng, action.row ?? 'players');
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
      return cardAction(state, pid, action.source, action.paid ?? false, rng);
    case 'pass':
      return pass(state, pid);
    case 'endTurn':
      return endTurn(state, pid);
    case 'submitLineup':
      return submitLineup(state, pid, action.submission, rng);
    case 'playTacticEffect':
      return playTacticEffect(state, pid, action.cardId, rng);
    case 'redrawTactic':
      return redrawTactic(state, pid, action.cardId);
    case 'rollMatchDie':
      return rollMatchDie(state, pid, rng);
    case 'rerollMatchDie':
      return rerollMatchDie(state, pid, rng);
    case 'acceptMatchRoll':
      return acceptMatchRoll(state, pid, rng);
    case 'rollInjuryDie':
      return rollInjuryDie(state, pid, rng);
    case 'rerollInjuryDie':
      return rerollInjuryDie(state, pid, rng);
    case 'acceptInjuryRoll':
      return acceptInjuryRoll(state, pid, rng);
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
    return inst ? instanceName(inst) : instanceId;
  };
  switch (action.type) {
    case 'draftPick':
      return '임원 카드를 골랐다';
    case 'chooseObjective':
      return '목표 카드를 골랐다';
    case 'resolvePending': {
      const pending = player.pending.find((p) => p.id === action.pendingId);
      const c = action.choice;
      if (pending?.target === 'die') return null; // 굴림·재굴림 결과는 effects.ts 가 기록한다
      const label =
        pending?.target === 'staff'
          ? (player.staff[Number(c)] ? cards.staff(player.staff[Number(c)]!.cardId).name : c)
          : pending?.target === 'market'
            ? (pending.row && before.market[pending.row][Number(c)] ? marketCardName(pending.row, before.market[pending.row][Number(c)]!) : c)
            : pending?.target === 'token'
              ? `토큰 ${player.uniforms.find((u) => u.id === c)?.number ?? '∅'}`
              : playerName(c);
      return `${pending?.source ?? '효과'} → ${label}`;
    }
    case 'playTacticEffect':
      return action.cardId === null ? '전술 효과 카드 없이 진행' : null; // 카드를 썼으면 friday.ts 가 기록
    case 'redrawTactic':
      return '특성: 전술 카드 1장을 버리고 새로 뽑음';
    case 'rollBoardDie':
    case 'rerollBoardDie': {
      const roll = after.phase.kind === 'monday.board' ? after.phase.meetings[pid]?.roll : null;
      return `${action.type === 'rerollBoardDie' ? '팬덤을 써서 다시 굴림' : '이사회 주사위'} → ${roll}`;
    }
    case 'acceptBoardRoll':
      return null; // monday.ts 가 결정 내용을 기록
    case 'recruitPlayer': {
      const id = before.market[action.row ?? 'players'][action.marketIndex];
      const kind = action.row === 'veterans' ? '베테랑 영입' : '영입';
      return id ? `${kind}: ${cards.player(id).name}` : kind;
    }
    case 'recruitProspect': {
      const id = before.decks.prospects[0];
      return id ? `유망주 영입 (${cards.player(id).untrained.role === 'attack' ? '공격' : '수비'})` : '유망주 영입';
    }
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
    case 'rollInjuryDie':
    case 'rerollInjuryDie': {
      const m = after.phase.kind === 'friday.aftermath' ? after.phase.matches[pid] : undefined;
      const die = m ? currentInjuryDie(m) : undefined;
      return `${action.type === 'rerollInjuryDie' ? '팬덤을 써서 부상 주사위를 다시 굴림' : '12면체 부상 주사위'} → ${die?.roll ?? ''}`;
    }
    case 'acceptInjuryRoll':
      return null; // friday.ts 의 injure 가 결과를 기록
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
  if (hasTurnSnapshot(state, pid)) return state; // 잠긴 스냅샷도 그대로 둔다 (다시 찍으면 잠금이 풀리므로)
  const { turnSnapshot, ...rest } = state;
  void turnSnapshot;
  return { ...rest, turnSnapshot: { pid, week: state.week, day: state.phase.day, locked: false, state: structuredClone(rest) } };
}

const DECKS: readonly (keyof Omit<Decks, 'discards'>)[] = ['starters', 'prospects', 'veterans', 'staff', 'sponsors', 'board', 'tactics', 'objectives'];

// 이번 행동으로 비공개 카드가 공개됐는가: 어떤 더미에서든 카드를 뽑았거나(시장 보충, 유망주 영입, 전술 카드 뽑기·교체), 상대 팀 카드를 미리 봤거나,
// 선수를 훈련했다(훈련 면이 공개된다 — 유망주는 특히 본명·능력이 드러남). 그런 차례는 "처음으로 되돌리기"로 무를 수 없다 — 본 정보를 되돌릴 수 없으므로 (사용자 결정, 2026-09)
function revealedHiddenCard(before: GameState, after: GameState): boolean {
  if (DECKS.some((d) => before.decks[d].length !== after.decks[d].length || before.decks[d][0] !== after.decks[d][0])) return true;
  return Object.keys(after.players).some((id) => {
    const prev = before.players[id];
    if (after.players[id]!.scouted && !prev?.scouted) return true;
    return after.players[id]!.roster.some((inst) => inst.trained && !prev?.roster.find((r) => r.instanceId === inst.instanceId)?.trained);
  });
}

export function undoTurn(state: GameState, pid: PlayerId): GameState {
  if (state.phase.kind !== 'weekday') throw new GameError('undo only during weekdays');
  if (state.phase.current !== pid) throw new GameError('not your turn');
  if (hasTurnSnapshot(state, pid) && state.turnSnapshot!.locked) throw new GameError('cannot undo after a card was revealed');
  if (!canUndoTurn(state, pid)) throw new GameError('nothing to undo');
  return structuredClone(state.turnSnapshot!.state);
}

export function applyAction(state: GameState, pid: PlayerId, action: GameAction, rng: Rng): GameState {
  getPlayer(state, pid);
  const base = action.type === 'undoTurn' ? state : withTurnSnapshot(state, pid);
  const next = apply(base, pid, action, rng);
  if (action.type !== 'undoTurn' && hasTurnSnapshot(next, pid) && !next.turnSnapshot!.locked && revealedHiddenCard(state, next)) {
    next.turnSnapshot = { ...next.turnSnapshot!, locked: true };
  }
  const text = describe(state, next, pid, action);
  if (text) {
    // 행동 당시의 주차·요일로 기록하고, 행동이 낳은 후속 기록(경기 결과, 주말 정산 등)보다 앞에 둔다
    const entry: LogEntry = { id: 0, week: state.week, day: currentDay(state), actor: pid, text };
    next.log.splice(state.log.length, 0, entry);
    next.log.forEach((l, i) => (l.id = i + 1));
  }
  return next;
}
