import { cards } from './cards';
import { createRng } from './rng';
import type { Rng } from './rng';
import { chooseObjective, createGame, draftPick } from './setup';
import type { GameConfig } from './setup';
import type { GameState, LineupSubmission, PlayerState } from './state';
import { buildLineup, eligiblePlayers } from './lineup';

export { eligiblePlayers };

export const FOUR_PLAYERS: GameConfig = {
  id: 'g',
  division: 3,
  players: [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
    { id: 'c', name: 'C' },
    { id: 'd', name: 'D' },
  ],
};

export function seededRng(seed = 42): Rng {
  return createRng(seed);
}

// 준비 단계를 끝내고 월요일 이사회 단계에 도달한 상태
export function gameAtMonday(config: GameConfig = FOUR_PLAYERS, seed = 42): GameState {
  let s = createGame(config, seededRng(seed));
  for (let round = 0; round < 3; round++) {
    for (const id of s.seats) {
      if (s.phase.kind !== 'setup.draft') throw new Error('draft ended early');
      s = draftPick(s, id, s.phase.hands[id]![0]!);
    }
  }
  for (const id of s.seats) {
    if (s.phase.kind !== 'setup.objective') throw new Error('objective phase expected');
    s = chooseObjective(s, id, s.phase.options[id]![0]!);
  }
  return s;
}

// 첫 전술 카드의 첫 포메이션으로 유효한 라인업 생성
export function autoLineup(player: PlayerState, players = eligiblePlayers(player)): LineupSubmission {
  const tacticCardId = player.tacticCards[0]!;
  const lineup = buildLineup(player, tacticCardId, cards.tactic(tacticCardId).formations[0]!, players);
  if (!lineup) throw new Error('no valid lineup');
  return lineup;
}
