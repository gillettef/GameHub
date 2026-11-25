import { cards } from './cards';
import { resolvePending } from './effects';
import { acceptInjuryRoll, acceptMatchRoll, advanceFriday, playTacticEffect, rollInjuryDie } from './friday';
import { createRng } from './rng';
import type { Rng } from './rng';
import { chooseObjective, createGame, draftPick } from './setup';
import type { GameConfig } from './setup';
import { currentInjuryDie } from './state';
import type { GameState, LineupSubmission, PlayerId, PlayerState } from './state';
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

// 대기 중인 대상 선택을 전부 첫 후보로 처리하고, 경기 준비 중이면 차례를 넘긴다 (경기 전 효과의 대상 선택 뒤에 필요)
export function settlePending(s: GameState, rng: Rng = seededRng()): GameState {
  for (const id of s.seats) {
    // 하나를 고르면 남은 대기 효과가 자동 적용·소거될 수 있으므로(훈련 2명 등) 복사본이 아니라 매번 맨 앞을 본다
    const pending = s.players[id]!.pending;
    let guard = 0;
    while (pending.length > 0) {
      if (++guard > 50) throw new Error('pending did not settle');
      const p = pending[0]!;
      resolvePending(s, id, p.id, p.candidates[0]!, rng);
    }
    advanceFriday(s, id, rng);
  }
  return s;
}

// 경기 진행 단계: 전원 전술 효과 카드 없이 진행해 경기 판정까지 간다
// 경기 영향 주사위 적용 + (부상류면) 12면체 부상 주사위까지 굴려 적용한다
export function applyMatchRoll(s: GameState, pid: PlayerId, rng: Rng = seededRng()): GameState {
  s = acceptMatchRoll(s, pid, rng);
  while (s.phase.kind === 'friday.aftermath' && currentInjuryDie(s.phase.matches[pid]!)) {
    s = acceptInjuryRoll(rollInjuryDie(s, pid, rng), pid, rng);
  }
  return s;
}

export function skipTacticEffects(s: GameState, rng: Rng = seededRng()): GameState {
  let guard = 0;
  while (s.phase.kind === 'friday.match') {
    if (++guard > 20) throw new Error('match phase did not finish');
    s = settlePending(playTacticEffect(s, s.phase.current, null, rng), rng);
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
