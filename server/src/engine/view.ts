import type { BoardMeeting, GameState, LineupSubmission, LogEntry, MatchAftermath, PlayerId, PlayerState, Weekday } from './state';
import type { ScoreBreakdown } from './scoring';

// 참가자에게 보내는 뷰. 비공개 정보(다른 참가자의 드래프트 손패·목표 카드·전술 손패·라인업, 덱 내용)는 제거한다

export type PhaseView =
  | { kind: 'setup.draft'; round: 1 | 2 | 3; hand: string[]; handSizes: Record<PlayerId, number>; picked: Record<PlayerId, boolean> }
  | { kind: 'setup.objective'; options: string[]; chosen: Record<PlayerId, boolean> }
  | { kind: 'monday.board'; current: PlayerId; meetings: Record<PlayerId, BoardMeeting> }
  | { kind: 'weekday'; day: Weekday; current: PlayerId; basicDone: boolean; paidDone: boolean }
  | { kind: 'friday.prepare'; current: PlayerId; submitted: Record<PlayerId, boolean>; mine: LineupSubmission | null }
  | { kind: 'friday.aftermath'; current: PlayerId; matches: Record<PlayerId, MatchAftermath> }
  | { kind: 'gameOver'; scores: Record<PlayerId, ScoreBreakdown>; winners: PlayerId[] };

export type PlayerPublicView = Omit<PlayerState, 'objective' | 'tacticCards' | 'opponentDeck' | 'nextInstance'> & {
  hasObjective: boolean;
  tacticCardCount: number;
  nextOpponent?: string;
  opponentsLeft: number;
};

export interface PlayerPrivateView {
  objective?: string;
  tacticCards: string[];
}

export interface GameView {
  id: string;
  me: PlayerId;
  division: GameState['division'];
  week: number;
  seats: PlayerId[];
  firstPlayer: PlayerId;
  phase: PhaseView;
  players: Record<PlayerId, PlayerPublicView>;
  self: PlayerPrivateView;
  market: GameState['market'];
  deckCounts: Record<'starters' | 'prospects' | 'veterans' | 'staff' | 'sponsors' | 'board' | 'tactics' | 'objectives', number>;
  league: GameState['league'];
  log: LogEntry[];
}

const LOG_TAIL = 100;

function publicPlayer(p: PlayerState): PlayerPublicView {
  const { objective, tacticCards, opponentDeck, ...rest } = p;
  const { nextInstance, ...publicRest } = rest;
  void nextInstance;
  return {
    ...publicRest,
    hasObjective: objective !== undefined,
    tacticCardCount: tacticCards.length,
    nextOpponent: opponentDeck[0],
    opponentsLeft: opponentDeck.length,
  };
}

function mapValues<T, U>(record: Record<PlayerId, T>, f: (v: T) => U): Record<PlayerId, U> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, f(v)]));
}

function phaseView(state: GameState, me: PlayerId): PhaseView {
  const phase = state.phase;
  switch (phase.kind) {
    case 'setup.draft':
      return {
        kind: 'setup.draft',
        round: phase.round,
        hand: phase.hands[me] ?? [],
        handSizes: mapValues(phase.hands, (h) => h.length),
        picked: mapValues(phase.picked, (c) => c !== null),
      };
    case 'setup.objective':
      return { kind: 'setup.objective', options: phase.options[me] ?? [], chosen: mapValues(phase.chosen, (c) => c !== null) };
    case 'friday.prepare':
      return { kind: 'friday.prepare', current: phase.current, submitted: mapValues(phase.submitted, (s) => s !== null), mine: phase.submitted[me] ?? null };
    default:
      return phase;
  }
}

export function viewFor(state: GameState, me: PlayerId): GameView {
  const self = state.players[me];
  const d = state.decks;
  return {
    id: state.id,
    me,
    division: state.division,
    week: state.week,
    seats: state.seats,
    firstPlayer: state.firstPlayer,
    phase: phaseView(state, me),
    players: mapValues(state.players, publicPlayer),
    self: { objective: self?.objective, tacticCards: self?.tacticCards ?? [] },
    market: state.market,
    deckCounts: {
      starters: d.starters.length,
      prospects: d.prospects.length,
      veterans: d.veterans.length,
      staff: d.staff.length,
      sponsors: d.sponsors.length,
      board: d.board.length,
      tactics: d.tactics.length,
      objectives: d.objectives.length,
    },
    league: state.league,
    log: state.log.slice(-LOG_TAIL),
  };
}
