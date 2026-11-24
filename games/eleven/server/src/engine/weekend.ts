import { cards } from './cards';
import { applyEffects } from './effects';
import { tagged } from './labels';
import { cycleMarket } from './market';
import { startMonday } from './monday';
import type { Rng } from './rng';
import { finalScores } from './scoring';
import { traitCount, traitSum, traitsOf } from './traits';
import { addLog, getPlayer, leftOf } from './state';
import type { GameState, PlayerState } from './state';

const PRINTED_INFRASTRUCTURE = 4; // p.9: 관중석 2 + 광고판 2
const UPKEEP_SUSPENSION = 2;
export const UPKEEP_SOURCE = tagged('유지비', '미납'); // 대기 효과(pending)의 source. 이 선택이 남아 있으면 다른 액션을 막는다 (actions.ts)
export const WEEKS = 6;

// p.27: 선수/직원/기반 시설 보유 수에 따른 주말 유지비 (카드 효과 할인 반영)
export function upkeepDue(player: Pick<PlayerState, 'roster' | 'staff' | 'executives' | 'infrastructure' | 'upkeepDiscount'>): number {
  const { upkeep } = cards.boardData;
  const at = (table: number[], n: number) => table[Math.min(n, table.length - 1)] ?? 0;
  const base = at(upkeep.players, player.roster.length) + at(upkeep.staff, player.staff.length) + at(upkeep.stadium, PRINTED_INFRASTRUCTURE + player.infrastructure.length);
  return Math.max(0, base - player.upkeepDiscount - traitSum(player, 'upkeepDiscount'));
}

// 미납 1돈당 출장정지 수: 기본 2, 특성이 있으면 그 값
export function upkeepSuspensionPer(player: Pick<PlayerState, 'staff' | 'executives'>): number {
  return traitsOf(player).reduce((n, t) => (t.kind === 'upkeepSuspension' ? Math.min(n, t.count) : n), UPKEEP_SUSPENSION);
}

// p.25 3: 못 낸 돈 1개마다 직원 카드 1장을 "선택하여" 출장정지 2개. 출장정지 없는 카드에 먼저.
// 고를 직원이 둘 이상이면 대기 효과로 쌓여 그 참가자가 고른다 (후보가 하나면 자동)
function payUpkeep(state: GameState, player: PlayerState, rng: Rng): { due: number; paid: number; suspensions: number } {
  const due = upkeepDue(player);
  player.upkeepDiscount = 0; // 할인은 한 번만
  const paid = Math.min(due, player.resources.money);
  player.resources.money -= paid;
  const shortfall = due - paid;
  const per = upkeepSuspensionPer(player);
  addLog(state, tagged('유지비', shortfall > 0 ? `${due} 중 ${paid}만 지불 → 직원 출장정지 ${shortfall * per}개` : `${due} 지불`), { actor: player.id, day: 'weekend' });
  for (let i = 0; i < shortfall; i++) applyEffects(state, player.id, [{ type: 'addStaffSuspension', count: per, unsuspendedFirst: true }], UPKEEP_SOURCE, {}, rng);
  return { due, paid, suspensions: player.staff.length > 0 ? shortfall * per : 0 };
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
    const upkeep = payUpkeep(state, player, rng);
    // p.25 5: 팬덤/체력/운영은 1개씩만 남긴다
    const before = { ...player.resources };
    player.resources.fandom = Math.min(1, player.resources.fandom);
    player.resources.stamina = Math.min(Math.max(1, traitCount(player, 'keepStamina')), player.resources.stamina); // 특성: 체력 N개까지 남김
    player.resources.ops = Math.min(1, player.resources.ops);
    const discarded = Object.fromEntries((['fandom', 'stamina', 'ops'] as const).map((r) => [r, before[r] - player.resources[r]]).filter(([, n]) => (n as number) > 0));
    // 월요일 조달(startMonday)이 procured 를 채운다
    player.weekReport = { week: state.week + 1, procured: { money: 0, fandom: 0, ops: 0, stamina: 0 }, upkeep, discarded };
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
  addLog(state, tagged('주말', `${state.week}주차 종료. 다음 선 참가자: ${getPlayer(state, state.firstPlayer).name}`), { day: 'weekend' });
  state.week++;
  startMonday(state);
}
