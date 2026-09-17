import { resolvePending } from './effects';
import { acceptMatchRoll, rerollMatchDie, rollMatchDie, submitLineup } from './friday';
import { acceptBoardRoll, rerollBoardDie, rollBoardDie } from './monday';
import type { Rng } from './rng';
import { chooseObjective, draftPick } from './setup';
import { GameError, getPlayer } from './state';
import type { GameState, LineupSubmission, PlayerId } from './state';
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
  | { type: 'acceptMatchRoll' };

export function applyAction(state: GameState, pid: PlayerId, action: GameAction, rng: Rng): GameState {
  getPlayer(state, pid);
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
    default:
      throw new GameError(`unknown action: ${(action as { type: string }).type}`);
  }
}
