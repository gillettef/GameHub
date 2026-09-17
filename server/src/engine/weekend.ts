import { cards } from './cards';
import { cycleMarket } from './market';
import { startMonday } from './monday';
import type { Rng } from './rng';
import { finalScores } from './scoring';
import { getPlayer, leftOf } from './state';
import type { GameState, PlayerState } from './state';

const PRINTED_INFRASTRUCTURE = 4; // p.9: 관중석 2 + 광고판 2
const UPKEEP_SUSPENSION = 2;
const WEEKS = 6;

// p.27: 선수/직원/기반 시설 보유 수에 따른 주말 유지비
export function upkeepDue(player: PlayerState): number {
  const { upkeep } = cards.boardData;
  const at = (table: number[], n: number) => table[Math.min(n, table.length - 1)] ?? 0;
  return at(upkeep.players, player.roster.length) + at(upkeep.staff, player.staff.length) + at(upkeep.infrastructure, PRINTED_INFRASTRUCTURE + player.infrastructure.length);
}

// p.25 3: 못 낸 돈 1개마다 직원 카드 1장에 출장정지 2개. 출장정지 없는 카드부터
function payUpkeep(state: GameState, player: PlayerState): void {
  const due = upkeepDue(player);
  const paid = Math.min(due, player.resources.money);
  player.resources.money -= paid;
  let shortfall = due - paid;
  state.log.push(`[${player.id}] 유지비 ${due} 중 ${paid} 지불`);
  while (shortfall > 0 && player.staff.length > 0) {
    const target = player.staff.find((s) => s.suspension === 0) ?? player.staff.reduce((a, b) => (a.suspension <= b.suspension ? a : b));
    target.suspension += UPKEEP_SUSPENSION;
    shortfall--;
  }
}

// p.25 주말. 상대 팀 카드가 다 떨어졌으면(6주차) 게임 종료
export function runWeekend(state: GameState, rng: Rng): void {
  for (const id of state.seats) {
    const player = getPlayer(state, id);
    for (const s of player.staff) s.exhausted = false;
    for (const e of player.executives) e.exhausted = false;
    for (const r of player.roster) r.exhausted = false;
  }

  if (state.week >= WEEKS || state.seats.every((id) => getPlayer(state, id).opponentDeck.length === 0)) {
    state.phase = { kind: 'gameOver', ...finalScores(state) };
    return;
  }

  for (const id of state.seats) {
    const player = getPlayer(state, id);
    payUpkeep(state, player);
    // p.25 5: 팬덤/체력/운영은 1개씩만 남긴다
    player.resources.fandom = Math.min(1, player.resources.fandom);
    player.resources.stamina = Math.min(1, player.resources.stamina);
    player.resources.ops = Math.min(1, player.resources.ops);
  }

  cycleMarket(state, 'players', rng);
  cycleMarket(state, 'staff', rng);
  cycleMarket(state, 'sponsors', rng);
  const prospect = state.decks.prospects.shift();
  if (prospect) state.decks.discards.players.push(prospect);

  state.firstPlayer = leftOf(state, state.firstPlayer);
  state.week++;
  startMonday(state);
}
