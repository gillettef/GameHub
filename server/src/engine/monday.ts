import { cards } from './cards';
import { applyEffects } from './effects';
import type { Rng } from './rng';
import { GameError, getPlayer } from './state';
import type { GameState, PlayerId, PlayerState } from './state';
import { RESOURCES } from './types';
import type { DieColor } from './types';
import { startWeekday } from './weekday';

// p.12 조달: 트랙 위치에 따라 자원 획득. p.13 이사회: 각자 이사회 카드 1장 공개
export function startMonday(state: GameState): void {
  const { procurement } = cards.boardData;
  const meetings: Record<PlayerId, { card: string; roll: null; decided: false }> = {};
  for (const id of state.seats) {
    const player = getPlayer(state, id);
    for (const r of RESOURCES) player.resources[r] += procurement[r][player.tracks[r] - 1] ?? 0;
    const card = state.decks.board.shift();
    if (!card) throw new GameError('board deck exhausted');
    meetings[id] = { card, roll: null, decided: false };
  }
  state.phase = { kind: 'monday.board', meetings };
}

// 주사위 눈에 대한 임원 3명의 투표 집계 (p.13)
export function tallyVotes(player: PlayerState, face: number): Record<DieColor, number> {
  const tally: Record<DieColor, number> = { yellow: 0, blue: 0, red: 0 };
  for (const exec of player.executives) tally[cards.executive(exec.cardId).votes[face - 1]!]++;
  return tally;
}

// 최다 득표 색. 동수면 null (무료 재굴림)
export function winningColor(tally: Record<DieColor, number>): DieColor | null {
  const sorted = (Object.entries(tally) as [DieColor, number][]).sort((a, b) => b[1] - a[1]);
  return sorted[0]![1] > sorted[1]![1] ? sorted[0]![0] : null;
}

function meetingOf(state: GameState, pid: PlayerId) {
  if (state.phase.kind !== 'monday.board') throw new GameError('not in board meeting');
  const m = state.phase.meetings[pid];
  if (!m) throw new GameError(`unknown player: ${pid}`);
  if (m.decided) throw new GameError('already decided');
  return m;
}

// 동수가 나오지 않을 때까지 무료로 다시 굴린다 (p.13 3)
function rollUntilDecisive(state: GameState, player: PlayerState, rng: Rng): number {
  for (;;) {
    const face = rng.die(6);
    if (winningColor(tallyVotes(player, face))) return face;
    state.log.push(`[${player.id}] 이사회 투표 동수 → 무료 재굴림`);
  }
}

export function rollBoardDie(state: GameState, pid: PlayerId, rng: Rng): GameState {
  const next = structuredClone(state);
  const m = meetingOf(next, pid);
  if (m.roll !== null) throw new GameError('already rolled; use reroll');
  m.roll = rollUntilDecisive(next, getPlayer(next, pid), rng);
  return next;
}

// 팬덤 1개로 재굴림 (p.12, p.13)
export function rerollBoardDie(state: GameState, pid: PlayerId, rng: Rng): GameState {
  const next = structuredClone(state);
  const m = meetingOf(next, pid);
  if (m.roll === null) throw new GameError('roll first');
  const player = getPlayer(next, pid);
  if (player.resources.fandom < 1) throw new GameError('not enough fandom');
  player.resources.fandom--;
  m.roll = rollUntilDecisive(next, player, rng);
  return next;
}

export function acceptBoardRoll(state: GameState, pid: PlayerId): GameState {
  const next = structuredClone(state);
  const m = meetingOf(next, pid);
  if (m.roll === null) throw new GameError('roll first');
  const player = getPlayer(next, pid);
  const color = winningColor(tallyVotes(player, m.roll))!;
  const card = cards.board(m.card);
  next.log.push(`[${pid}] 이사회 "${card.name}": ${color} 결정`);
  applyEffects(next, pid, card.decisions[color].effects, `이사회:${card.name}`);
  next.decks.discards.board.push(m.card);
  m.decided = true;

  if (next.phase.kind === 'monday.board' && Object.values(next.phase.meetings).every((x) => x.decided)) {
    startWeekday(next);
  }
  return next;
}
