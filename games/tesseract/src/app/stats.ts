/**
 * 플레이테스트 통계 (로드맵 9단계): 끝난 게임 기록을 다시 재생해 규칙 밸런스 지표를 모은다.
 * docs/rule.md §13 "미정 사항 / 플레이테스트 확인 포인트"에 답하기 위한 숫자들.
 */
import {
  createGame,
  applyAction,
  finalScores,
  LAWS,
  PERSONAL_GOALS,
  ROUND_GOALS,
  type GameState,
  type LawId,
  type PersonalGoalId,
  type RoundGoalId,
} from '../engine'
import type { Session } from './session'

export interface GameSummary {
  id: string
  createdAt: number
  law: LawId
  players: number
  winners: string[]
  scores: { name: string; kind: string; total: number; line: number; plane: number; tower: number; time: number; goals: number; personal: number; debris: number }[]
  /** 3라운드 잔해 수 (사람·봇 합계) */
  round3Debris: number
  /** 4라운드에 넘긴 ⧗ 주사위 수 / 잔해가 된 ⧗ 주사위 수 */
  timeRolls: number
  timeScraps: number
  /** ⧗ 주사위가 0개로 4라운드를 시작한 플레이어 수 */
  zeroTimePlayers: number
  roundGoals: { id: RoundGoalId; achievers: number }[]
  personalGoals: { id: PersonalGoalId; achieved: boolean }[]
}

/** 기록 하나를 재생해 요약한다 */
export function summarize(session: Session): GameSummary {
  let state: GameState = createGame(session.config)
  let round3Debris = 0
  let timeRolls = 0
  let timeScraps = 0
  let zeroTimePlayers = 0
  for (const action of session.actions) {
    const before = state
    state = applyAction(state, action)
    if (before.phase.kind === 'round' && before.phase.round === 3 && action.type === 'discard') round3Debris++
    if (action.type === 'roll') timeRolls++
    if (action.type === 'scrap') timeScraps++
    if (before.time === null && state.time !== null) zeroTimePlayers = state.time.pending.filter((p) => p.length === 0).length
  }
  const scores = finalScores(state)
  const nameOf = (p: number) => session.seats[p]?.name ?? `${p + 1}번`
  return {
    id: session.id,
    createdAt: session.createdAt,
    law: state.law,
    players: state.players.length,
    winners: scores.filter((s) => s.rank === 1).map((s) => nameOf(s.player)),
    scores: scores.map((s) => ({
      name: nameOf(s.player),
      kind: session.seats[s.player]?.kind ?? 'human',
      total: s.total,
      line: s.line,
      plane: s.plane,
      tower: s.tower,
      time: s.time,
      goals: s.goals,
      personal: s.personalGoal,
      debris: s.debris,
    })),
    round3Debris,
    timeRolls,
    timeScraps,
    zeroTimePlayers,
    roundGoals: state.roundGoals.map((g) => ({ id: g.id, achievers: (g.first === null ? 0 : 1) + g.achieved.length })),
    personalGoals: state.players.flatMap((p) =>
      p.personalGoal ? [{ id: p.personalGoal, achieved: PERSONAL_GOALS[p.personalGoal].check(p) }] : [],
    ),
  }
}

export interface Rate {
  label: string
  value: string
}

const avg = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length)
const pct = (n: number, d: number) => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`)
const fmt = (n: number) => n.toFixed(1)

/** 여러 게임을 묶은 지표 */
export function aggregate(games: GameSummary[]): { overview: Rate[]; goals: Rate[]; personal: Rate[]; laws: Rate[] } {
  const all = games.flatMap((g) => g.scores)
  const totals = all.map((s) => s.total)
  const goalShare = avg(all.map((s) => (s.total > 0 ? s.goals / s.total : 0)))
  const overview: Rate[] = [
    { label: '게임 수', value: String(games.length) },
    { label: '평균 총점', value: fmt(avg(totals)) },
    { label: '평균 선 / 평면 / 입체 / 시간', value: [all.map((s) => s.line), all.map((s) => s.plane), all.map((s) => s.tower), all.map((s) => s.time)].map((xs) => fmt(avg(xs))).join(' / ') },
    { label: '목표 점수 비중 (목표 30~40%)', value: `${Math.round(goalShare * 100)}%` },
    { label: '1인당 평균 잔해', value: fmt(avg(all.map((s) => -s.debris))) },
    { label: '3라운드 1인당 평균 잔해', value: fmt(avg(games.map((g) => g.round3Debris / g.players))) },
    { label: '4라운드 1인당 평균 넘기기', value: fmt(avg(games.map((g) => g.timeRolls / g.players))) },
    { label: '넘길 곳 없어 잔해가 된 ⧗ 비율', value: pct(games.reduce((a, g) => a + g.timeScraps, 0), games.reduce((a, g) => a + g.timeRolls + g.timeScraps, 0)) },
    { label: '⧗ 주사위 0개로 4라운드 시작', value: pct(games.reduce((a, g) => a + g.zeroTimePlayers, 0), games.reduce((a, g) => a + g.players, 0)) },
    { label: '봇 승률', value: pct(games.filter((g) => g.scores.some((s) => s.kind === 'bot' && g.winners.includes(s.name))).length, games.length) },
  ]

  const goalCount = new Map<RoundGoalId, { shown: number; achievers: number; players: number }>()
  for (const g of games) {
    for (const r of g.roundGoals) {
      const c = goalCount.get(r.id) ?? { shown: 0, achievers: 0, players: 0 }
      goalCount.set(r.id, { shown: c.shown + 1, achievers: c.achievers + r.achievers, players: c.players + g.players })
    }
  }
  const goals = [...goalCount.entries()]
    .map(([id, c]) => ({ label: `${ROUND_GOALS[id].round}R ${ROUND_GOALS[id].name}`, n: c.achievers / c.players, value: `${pct(c.achievers, c.players)} (${c.shown}회)` }))
    .sort((a, b) => b.n - a.n)
    .map(({ label, value }) => ({ label, value }))

  const personalCount = new Map<PersonalGoalId, { picked: number; achieved: number }>()
  for (const g of games) {
    for (const p of g.personalGoals) {
      const c = personalCount.get(p.id) ?? { picked: 0, achieved: 0 }
      personalCount.set(p.id, { picked: c.picked + 1, achieved: c.achieved + (p.achieved ? 1 : 0) })
    }
  }
  const personal = [...personalCount.entries()].map(([id, c]) => ({
    label: PERSONAL_GOALS[id].name,
    value: `${pct(c.achieved, c.picked)} (${c.picked}회 선택)`,
  }))

  const lawGames = new Map<LawId, number[]>()
  for (const g of games) lawGames.set(g.law, [...(lawGames.get(g.law) ?? []), ...g.scores.map((s) => s.total)])
  const laws = [...lawGames.entries()].map(([id, t]) => ({ label: LAWS[id].name, value: `평균 ${fmt(avg(t))}점 (${t.length}명)` }))

  return { overview, goals, personal, laws }
}
