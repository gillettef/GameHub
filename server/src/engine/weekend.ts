import { cards } from './cards';
import { cycleMarket } from './market';
import { startMonday } from './monday';
import type { Rng } from './rng';
import { finalScores } from './scoring';
import { traitCount, traitSum, traitsOf } from './traits';
import { addLog, getPlayer, leftOf } from './state';
import type { GameState, PlayerState } from './state';

const PRINTED_INFRASTRUCTURE = 4; // p.9: 관중석 2 + 광고판 2
const UPKEEP_SUSPENSION = 2;
const WEEKS = 6;

// p.27: 선수/직원/기반 시설 보유 수에 따른 주말 유지비 (카드 효과 할인 반영)
export function upkeepDue(player: Pick<PlayerState, 'roster' | 'staff' | 'executives' | 'infrastructure' | 'upkeepDiscount'>): number {
  const { upkeep } = cards.boardData;
  const at = (table: number[], n: number) => table[Math.min(n, table.length - 1)] ?? 0;
  const base = at(upkeep.players, player.roster.length) + at(upkeep.staff, player.staff.length) + at(upkeep.stadium, PRINTED_INFRASTRUCTURE + player.infrastructure.length);
  return Math.max(0, base - player.upkeepDiscount - traitSum(player, 'upkeepDiscount'));
}

// p.25 3: 못 낸 돈 1개마다 직원 카드 1장에 출장정지 2개. 출장정지 없는 카드부터
function payUpkeep(state: GameState, player: PlayerState): void {
  const due = upkeepDue(player);
  player.upkeepDiscount = 0; // 할인은 한 번만
  const paid = Math.min(due, player.resources.money);
  player.resources.money -= paid;
  let shortfall = due - paid;
  // 특성: 미납 1돈당 출장정지 N개 (기본 2)
  const per = traitsOf(player).reduce((n, t) => (t.kind === 'upkeepSuspension' ? Math.min(n, t.count) : n), UPKEEP_SUSPENSION);
  addLog(state, shortfall > 0 ? `유지비 ${due} 중 ${paid}만 지불 → 직원 출장정지 ${shortfall * per}개` : `유지비 ${due} 지불`, { actor: player.id, day: 'weekend' });
  while (shortfall > 0 && player.staff.length > 0) {
    const target = player.staff.find((s) => s.suspension === 0) ?? player.staff.reduce((a, b) => (a.suspension <= b.suspension ? a : b));
    target.suspension += per;
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
    player.resources.stamina = Math.min(Math.max(1, traitCount(player, 'keepStamina')), player.resources.stamina); // 특성: 체력 N개까지 남김
    player.resources.ops = Math.min(1, player.resources.ops);
    // p.25 5: 이번 주의 점검용 토큰(요일 제한)은 버린다. 다음 주 것은 남긴다
    player.restrictions = player.restrictions.filter((r) => r.week > state.week);
    // 특성(팬덤 없이 재굴림)은 주당 1회 — 새 주에 다시 쓸 수 있다
    player.freeRerollUsed = { board: false, match: false };
  }

  cycleMarket(state, 'players', rng);
  cycleMarket(state, 'veterans', rng);
  cycleMarket(state, 'staff', rng);
  cycleMarket(state, 'sponsors', rng);
  const prospect = state.decks.prospects.shift();
  if (prospect) state.decks.discards.prospects.push(prospect);

  state.firstPlayer = leftOf(state, state.firstPlayer);
  addLog(state, `${state.week}주차 종료. 다음 선 참가자: ${getPlayer(state, state.firstPlayer).name}`, { day: 'weekend' });
  state.week++;
  startMonday(state);
}
