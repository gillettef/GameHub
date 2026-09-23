import { cards } from './cards';
import { applyEffects } from './effects';
import type { Rng } from './rng';
import { COLOR_LABEL, boardSource, tagged } from './labels';
import { GameError, addLog, getPlayer, nextInTurn, requireTurn } from './state';
import type { GameState, PlayerId, PlayerState } from './state';
import { hasTrait } from './traits';
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
  state.phase = { kind: 'monday.board', current: state.firstPlayer, meetings };
}

// 주사위 눈에 대한 임원 3명의 투표 집계 (p.13)
export function tallyVotes(player: Pick<PlayerState, 'executives'>, face: number): Record<DieColor, number> {
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
  requireTurn(state.phase, pid);
  return m;
}

// 임원 3명의 조합에 따라 6면 모두 동수(1-1-1)일 수도 있다. 그러면 재굴림으로는 영원히 결정이 나지 않으므로
// 첫 번째 임원(먼저 뽑은 임원)의 표를 따른다 — 규칙서에 없는 온라인 구현의 확정 사항
export function hasDecisiveFace(player: Pick<PlayerState, 'executives'>): boolean {
  return [1, 2, 3, 4, 5, 6].some((face) => winningColor(tallyVotes(player, face)) !== null);
}

// 주사위 눈에 대한 이사회 결정 색. 동수면 첫 임원의 표 (동수 눈은 굴릴 때 이미 재굴림되므로 여기서는 모든 눈이 동수인 경우만 해당)
export function boardDecision(player: Pick<PlayerState, 'executives'>, face: number): DieColor {
  return winningColor(tallyVotes(player, face)) ?? cards.executive(player.executives[0]!.cardId).votes[face - 1]!;
}

// 동수가 나오지 않을 때까지 무료로 다시 굴린다 (p.13 3)
function rollUntilDecisive(state: GameState, player: PlayerState, rng: Rng): number {
  if (!hasDecisiveFace(player)) {
    const face = rng.die(6);
    addLog(state, tagged('이사회', `임원 투표가 모든 눈에서 동수 → 첫 임원 ${cards.executive(player.executives[0]!.cardId).name}의 표를 따름`), { actor: player.id });
    return face;
  }
  for (;;) {
    const face = rng.die(6);
    if (winningColor(tallyVotes(player, face))) return face;
    addLog(state, tagged('이사회', '투표 동수 → 무료 재굴림'), { actor: player.id });
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
  // 특성(팬덤 없이 재굴림)은 주당 1회 (사용자 결정, 2026-09). 그 뒤로는 팬덤을 낸다
  if (hasTrait(player, 'freeBoardReroll') && !player.freeRerollUsed.board) {
    player.freeRerollUsed.board = true;
    addLog(next, tagged('특성', '팬덤 없이 이사회 주사위를 다시 굴림 (이번 주 무료 재굴림 사용)'), { actor: pid });
  } else {
    if (player.resources.fandom < 1) throw new GameError('not enough fandom');
    player.resources.fandom--;
  }
  m.roll = rollUntilDecisive(next, player, rng);
  return next;
}

export function acceptBoardRoll(state: GameState, pid: PlayerId): GameState {
  const next = structuredClone(state);
  const m = meetingOf(next, pid);
  if (m.roll === null) throw new GameError('roll first');
  const player = getPlayer(next, pid);
  const color = boardDecision(player, m.roll);
  const card = cards.board(m.card);
  addLog(next, tagged('이사회', `"${card.name}" → ${COLOR_LABEL[color]} 결정: ${card.decisions[color].text}`), { actor: pid });
  applyEffects(next, pid, card.decisions[color].effects, boardSource(card));
  next.decks.discards.board.push(m.card);
  m.decided = true;

  if (next.phase.kind === 'monday.board') {
    const meetings = next.phase.meetings;
    const following = nextInTurn(next, (id) => meetings[id]!.decided);
    if (following) next.phase.current = following;
    else startWeekday(next);
  }
  return next;
}
