import { describe, expect, it } from 'vitest';
import { resolvePending } from './effects';
import { acceptMatchRoll, rollMatchDie, submitLineup } from './friday';
import { acceptBoardRoll, rollBoardDie } from './monday';
import type { Rng } from './rng';
import type { GameState } from './state';
import { TRACK_MAX, TRACK_MIN } from './types';
import { autoLineup, eligiblePlayers, gameAtMonday, seededRng } from './test-utils';
import { buildInfrastructure, buildOffice, cardAction, endTurn, hireStaff, pass, recruitPlayer, recruitProspect, signSponsor } from './weekday';

// 대기 중인 대상 선택은 첫 후보로 처리
function settlePending(s: GameState): GameState {
  for (const id of s.seats) {
    for (const p of [...s.players[id]!.pending]) resolvePending(s, id, p.id, p.candidates[0]!);
  }
  return s;
}

function tryActions(s: GameState, pid: string, rng: Rng): GameState {
  const attempts: Array<() => GameState> = [
    () => recruitPlayer(s, pid, 2 + rng.int(3), rng),
    () => recruitProspect(s, pid),
    () => hireStaff(s, pid, 2 + rng.int(3), rng),
    () => signSponsor(s, pid, 2 + rng.int(3), (['kit', 'billboard', 'naming'] as const)[rng.int(3)]!, rng),
    () => buildInfrastructure(s, pid, (['lights', 'shop', 'execOffice', 'trainingGround', 'stand3', 'stand4', 'billboard3'] as const)[rng.int(7)]!),
    () => buildOffice(s, pid),
    () => cardAction(s, pid, { kind: 'staff', index: rng.int(s.players[pid]!.staff.length) }),
  ];
  for (let i = 0; i < 4; i++) {
    try {
      return attempts[rng.int(attempts.length)]!();
    } catch {
      /* 규칙상 불가 → 다른 행동 시도 */
    }
  }
  return pass(s, pid);
}

function checkInvariants(s: GameState): void {
  for (const id of s.seats) {
    const p = s.players[id]!;
    for (const v of Object.values(p.resources)) expect(v).toBeGreaterThanOrEqual(0);
    for (const v of Object.values(p.tracks)) {
      expect(v).toBeGreaterThanOrEqual(TRACK_MIN);
      expect(v).toBeLessThanOrEqual(TRACK_MAX);
    }
    expect(p.uniforms.filter((u) => u.location === 'field')).toHaveLength(10);
    expect(p.uniforms).toHaveLength(13);
    for (const r of p.roster) for (const v of Object.values(r.tokens)) expect(v).toBeGreaterThanOrEqual(0);
    expect(s.league.players[id]).toBeLessThanOrEqual(18);
  }
}

function playFullGame(seed: number): GameState {
  const rng = seededRng(seed);
  let s = gameAtMonday(undefined, seed);
  let guard = 0;
  while (s.phase.kind !== 'gameOver') {
    if (++guard > 2000) throw new Error(`stuck in ${s.phase.kind} week ${s.week}`);
    s = settlePending(s);
    switch (s.phase.kind) {
      case 'monday.board': {
        const pid = s.seats.find((id) => (s.phase as { meetings: Record<string, { decided: boolean }> }).meetings[id]!.decided === false)!;
        s = acceptBoardRoll(rollBoardDie(s, pid, rng), pid);
        break;
      }
      case 'weekday': {
        const pid = s.phase.current;
        s = tryActions(s, pid, rng);
        s = settlePending(s);
        s = endTurn(s, pid);
        break;
      }
      case 'friday.prepare': {
        const pid = s.seats.find((id) => (s.phase as { submitted: Record<string, unknown> }).submitted[id] === null)!;
        const player = s.players[pid]!;
        s = submitLineup(s, pid, autoLineup(player, eligiblePlayers(player, player.resources.stamina)), rng);
        break;
      }
      case 'friday.aftermath': {
        const pid = s.seats.find((id) => (s.phase as { matches: Record<string, { decided: boolean }> }).matches[id]!.decided === false)!;
        s = acceptMatchRoll(rollMatchDie(s, pid, rng), pid, rng);
        break;
      }
      default:
        throw new Error(`unexpected phase ${s.phase.kind}`);
    }
    checkInvariants(s);
  }
  return s;
}

// 한 판에 수백 번의 structuredClone 이 들어가 느린 환경에서는 수 초가 걸린다
const SIM_TIMEOUT_MS = 60000;

describe('한 판 전체 시뮬레이션', () => {
  it.each([1, 2, 3, 4, 5])('시드 %i: 6주를 끝까지 진행하고 승자를 낸다', { timeout: SIM_TIMEOUT_MS }, (seed) => {
    const s = playFullGame(seed);
    expect(s.week).toBe(6);
    if (s.phase.kind !== 'gameOver') throw new Error();
    expect(s.phase.winners.length).toBeGreaterThan(0);
    for (const id of s.seats) {
      expect(s.players[id]!.opponentDeck).toHaveLength(0);
      expect(Number.isFinite(s.phase.scores[id]!.total)).toBe(true);
    }
    expect(s.log.filter((l) => /^경기 결과 \d+:\d+/.test(l.text))).toHaveLength(6 * 4);
    expect(s.log.every((l) => l.week >= 1 && l.week <= 6 && l.id > 0)).toBe(true);
  });
});
