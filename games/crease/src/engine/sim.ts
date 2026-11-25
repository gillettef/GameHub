// CREASE 밸런스 시뮬레이터: 봇끼리 여러 판을 두고 좌석 승률·진행 통계를 낸다(CLI: npm run sim, 웹 시뮬레이션 화면).
import { chooseTurn, type ProfileName } from './bot.ts'
import { doFold, doStep, finishTurn, isCoveredCol, mulberry32, newGame, startTurn, winners, type State, type TurnAction } from './engine.ts'
import type { Config } from './rules.ts'

/** 봇이 활성 플레이어의 한 차례를 끝까지 둔다. 둔 행동을 돌려준다 */
export function playBotTurn(s: State, profile: ProfileName, rnd: () => number): TurnAction[] {
  startTurn(s)
  const acts = chooseTurn(s, profile, rnd)
  for (const a of acts) {
    if (a.type === 'step') doStep(s, a.to)
    else doFold(s, a)
  }
  finishTurn(s)
  return acts
}

export interface GameStats {
  folds: number
  unfolds: number
  foldWidths: Record<number, number>
  coverEvents: number
  absentTurns: number
  turns: number
}

export interface GameResult {
  winners: number[]
  rounds: number
  scores: number[]
  stats: GameStats
  timeout: boolean
}

const TURN_LIMIT = 400

export function runGame(n: number, seed: number, config: Config, profiles: ProfileName[]): GameResult {
  const s = newGame(n, seed, config)
  const rnd = mulberry32(seed * 7919 + 13)
  const stats: GameStats = { folds: 0, unfolds: 0, foldWidths: {}, coverEvents: 0, absentTurns: 0, turns: 0 }
  let guard = 0
  while (!s.over && guard++ < TURN_LIMIT) {
    const me = s.players[s.current]!
    if (isCoveredCol(s.fold, me.c)) stats.absentTurns++
    const before = s.players.map((p) => isCoveredCol(s.fold, p.c))
    const acts = playBotTurn(s, profiles[s.current % profiles.length]!, rnd)
    for (const a of acts) {
      if (a.type === 'fold') {
        stats.folds++
        stats.foldWidths[a.width] = (stats.foldWidths[a.width] ?? 0) + 1
      }
      if (a.type === 'unfold') stats.unfolds++
    }
    s.players.forEach((p, i) => {
      if (i !== me.id && !before[i] && isCoveredCol(s.fold, p.c)) stats.coverEvents++
    })
    stats.turns++
  }
  return { winners: winners(s), rounds: s.round, scores: s.players.map((p) => p.score), stats, timeout: guard >= TURN_LIMIT }
}

export function runBatch(n: number, games: number, config: Config, profiles: ProfileName[], seed0 = 1) {
  const wins = new Array<number>(n).fill(0)
  let rounds = 0
  let turns = 0
  let folds = 0
  let unfolds = 0
  let covers = 0
  let absent = 0
  let timeouts = 0
  let margin = 0
  let ties = 0
  const widths: Record<string, number> = {}
  for (let g = 0; g < games; g++) {
    const r = runGame(n, seed0 + g, config, profiles)
    for (const w of r.winners) wins[w]! += 1 / r.winners.length
    if (r.winners.length > 1) ties++
    rounds += r.rounds
    turns += r.stats.turns
    folds += r.stats.folds
    unfolds += r.stats.unfolds
    covers += r.stats.coverEvents
    absent += r.stats.absentTurns
    timeouts += r.timeout ? 1 : 0
    const sorted = [...r.scores].sort((a, b) => b - a)
    margin += sorted[0]! - sorted[1]!
    for (const [w, c] of Object.entries(r.stats.foldWidths)) widths[w] = (widths[w] ?? 0) + c
  }
  const fix = (v: number, d: number) => +v.toFixed(d)
  return {
    players: n,
    games,
    seatWinRate: wins.map((w) => fix(w / games, 3)),
    avgRounds: fix(rounds / games, 1),
    avgTurns: fix(turns / games, 1),
    foldPerTurn: fix(folds / turns, 2),
    unfoldPerTurn: fix(unfolds / turns, 2),
    coverPerGame: fix(covers / games, 1),
    absentTurnRate: fix(absent / turns, 3),
    avgMargin: fix(margin / games, 2),
    tieRate: fix(ties / games, 3),
    foldWidths: widths,
    timeouts,
  }
}
