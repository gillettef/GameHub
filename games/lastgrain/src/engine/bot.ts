// LASTGRAIN 봇 — 행동 하나씩 고르는 탐욕형(1수 앞) 평가 봇. 봇도 생각하는 동안 자기 모래가 흐른다(행동 사이 지연).
import { KINDS, RUINS, apply, clone, inBoard, isSpring, legalActions, onBoard, unitAt, type Action, type Cell, type State, type Unit } from './rules.ts'

const DIRS: Cell[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
const RUIN_CELLS = RUINS.map((k) => k.split(',').map(Number) as Cell)
const SPRING_CELLS: Cell[] = [
  [1, 1],
  [3, 1],
  [1, 3],
  [3, 3],
]
const dist = (a: Cell, b: Cell) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])

export type Level = 'easy' | 'normal' | 'hard'
export const LEVELS: Record<Level, { name: string; noise: number; gain: number }> = {
  easy: { name: '쉬움', noise: 6, gain: 1.5 },
  normal: { name: '보통', noise: 1.5, gain: 0.6 },
  hard: { name: '어려움', noise: 0, gain: 0.3 },
}
export const isLevel = (v: unknown): v is Level => v === 'easy' || v === 'normal' || v === 'hard'

/** 다음 차례에 상대가 밀어낼 수 있는가(인접한 적이 있고 밀려날 칸이 비었거나 보드 밖). */
function pushThreat(s: State, u: Unit) {
  const [c, r] = u.pos!
  let offBoard = false
  let any = false
  for (const [dc, dr] of DIRS) {
    const e = unitAt(s, c + dc, r + dr)
    if (!e || e.owner === u.owner) continue
    const pc = c - dc
    const pr = r - dr
    if (!inBoard(pc, pr)) {
      any = true
      offBoard = true
    } else if (!unitAt(s, pc, pr)) any = true
  }
  return { any, offBoard }
}

const adjacentEnemy = (s: State, u: Unit) =>
  DIRS.some(([dc, dr]) => {
    const e = unitAt(s, u.pos![0] + dc, u.pos![1] + dr)
    return e && e.owner !== u.owner
  })

const unitValue = (u: Unit) => 3 + Math.min(u.rem, 90_000) / 10_000

/** me 관점의 판 평가값. 내 차례 도중(행동 직후)에 부른다. */
export function evaluate(s: State, me: number): number {
  if (s.over) return s.winner === me ? 1e6 : -1e6
  const op = 1 - me
  let v = (s.scores[me]! - s.scores[op]!) * 12

  for (const [c, r] of RUIN_CELLS) {
    const u = unitAt(s, c, r)
    if (!u) continue
    if (u.owner === op) v -= 12 // 내 차례가 끝나면 곧바로 점수를 얻는다
    else v += pushThreat(s, u).any ? 3 : 11
  }

  for (const u of onBoard(s, me)) {
    let val = unitValue(u)
    const threat = pushThreat(s, u)
    if (threat.offBoard) val *= 0.3
    if (adjacentEnemy(s, u) && u.rem > u.cap / 2) v -= ((2 * u.rem - u.cap) / 10_000) * 1.1
    v += val
    // 전진: 내가 차지하지 않은 가장 가까운 유적 쪽으로
    const free = RUIN_CELLS.filter(([c, r]) => {
      const o = unitAt(s, c, r)
      return !o || o.owner !== me
    })
    if (free.length && !RUIN_CELLS.some((rc) => dist(rc, u.pos!) === 0)) v -= 1.0 * Math.min(...free.map((rc) => dist(rc, u.pos!)))
    // 잔량이 적고 샘을 쓸 수 있으면 샘 쪽으로
    if (KINDS[u.kind].spring && u.rem < u.cap * 0.35 && !isSpring(...u.pos!)) {
      v -= 0.6 * Math.min(...SPRING_CELLS.map((sc) => dist(sc, u.pos!)))
    }
  }
  for (const u of onBoard(s, op)) {
    v -= unitValue(u)
    // 다음 내 차례에 강제 뒤집기로 노릴 수 있는 잔량 많은 적
    if (adjacentEnemy(s, u) && u.rem > u.cap * 0.7) v += 0.8
  }
  return v
}

/** 다음에 할 행동 하나를 고른다. {type:'end'}이면 차례를 마친다. rand 는 [0,1) 난수 */
export function chooseAction(s: State, level: Level, rand: () => number): Action {
  const me = s.active
  const L = LEVELS[level] || LEVELS.normal
  const actions = legalActions(s)
  if (!actions.length) return { type: 'end' }
  const base = evaluate(s, me)
  let best: Action | null = null
  let bestV = -Infinity
  for (const a of actions) {
    const t = clone(s)
    if (!apply(t, a).ok) continue
    const v = evaluate(t, me) + (rand() - 0.5) * L.noise
    if (v > bestV) {
      bestV = v
      best = a
    }
  }
  if (!best) return { type: 'end' }
  if (s.mustSummon) return best // 반드시 소환
  return bestV > base + L.gain ? best : { type: 'end' }
}
