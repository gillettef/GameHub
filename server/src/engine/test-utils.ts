import { activeSide, cards } from './cards';
import { sectorCounts } from './match';
import { createRng } from './rng';
import type { Rng } from './rng';
import { chooseObjective, createGame, draftPick } from './setup';
import type { GameConfig } from './setup';
import type { GameState, LineupSubmission, PlayerState } from './state';
import { SECTORS } from './types';
import type { Sector } from './types';

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

// 출전 가능한 선수(부상/출장정지 없음, 등번호 중복 없음)를 체력 한도 안에서 고른다
export function eligiblePlayers(player: PlayerState, max = Infinity): string[] {
  const numbers = new Set<number>();
  const chosen: string[] = [];
  for (const inst of player.roster) {
    if (chosen.length >= max) break;
    if (inst.tokens.injury > 0 || inst.tokens.suspension > 0) continue;
    const n = activeSide(inst).number;
    if (n !== undefined) {
      if (numbers.has(n)) continue;
      numbers.add(n);
    }
    chosen.push(inst.instanceId);
  }
  return chosen;
}

// 첫 전술 카드의 첫 포메이션으로 유효한 배치를 자동 생성. 벤치 토큰 교환은 엔진과 같은 규칙으로 미리 흉내낸다
export function autoLineup(player: PlayerState, players = eligiblePlayers(player)): LineupSubmission {
  const tacticCardId = player.tacticCards[0]!;
  const need = sectorCounts(cards.tactic(tacticCardId).formations[0]!);
  const uniforms = structuredClone(player.uniforms);
  for (const instanceId of players) {
    const token = uniforms.find((u) => u.cardInstanceId === instanceId);
    if (!token || token.location === 'field') continue;
    const swapOut = uniforms
      .filter((u) => u.location === 'field' && (!u.cardInstanceId || !players.includes(u.cardInstanceId)))
      .sort((a, b) => (b.number ?? -1) - (a.number ?? -1))[0]!;
    swapOut.location = 'bench';
    token.location = 'field';
  }

  const placements: Record<string, Sector> = {};
  const field = uniforms.filter((u) => u.location === 'field');
  const zonesOf = (instanceId: string) => activeSide(player.roster.find((r) => r.instanceId === instanceId)!).zones;
  // 허용 구획이 적은 선수부터 배치. 자리가 없으면 그 선수를 빼고 다시 시도
  const carded = field
    .filter((u) => u.cardInstanceId && players.includes(u.cardInstanceId))
    .sort((a, b) => zonesOf(a.cardInstanceId!).length - zonesOf(b.cardInstanceId!).length);
  for (const token of carded) {
    const sector = zonesOf(token.cardInstanceId!).find((z) => need[z] > 0);
    if (!sector) return autoLineup(player, players.filter((id) => id !== token.cardInstanceId));
    placements[token.id] = sector;
    need[sector]--;
  }
  for (const token of field.filter((u) => !(u.id in placements))) {
    const sector = SECTORS.find((z) => need[z] > 0)!;
    placements[token.id] = sector;
    need[sector]--;
  }
  return { tacticCardId, formationIndex: 0, players, placements };
}
