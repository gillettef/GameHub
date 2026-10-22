/**
 * 4라운드 — 시간의 세계 (§9)
 *
 * 시점마다: ① 미래 엿보기 → ② 시간 세기(시점 시작에 고정) → ③ 돌리기(모두 동시에) + ④ 인과 역류
 * → 모두 마치면 ⑤ 사건 해결. t3 사건을 해결하면 게임이 끝난다 (§10).
 */
import { isTime, tip, TIP_DIRECTIONS, type TipDirection } from './dice'
import { fail } from './errors'
import { EVENT_DECK, EVENTS, TIMELINE_LENGTH, type EventDef } from './events'
import { canStackOn, topOf } from './placement'
import { shuffle } from './rng'
import type { Board, Die, GameState, Pillar, PlayerState, TimeState } from './types'

export type TimeAction =
  | { type: 'rotate'; player: number; row: number; col: number; level: number; direction: TipDirection }
  | { type: 'endStep'; player: number }

/** §9 ② 윗면이 ⧗인 꼭대기의 수. 기둥 속에 묻힌 ⧗은 세지 않는다 */
export function countTimeTops(board: Board): number {
  return board.cells.flat().filter((pillar) => {
    const top = topOf(pillar)
    return top !== undefined && isTime(top.orientation.top)
  }).length
}

/**
 * §9 ④ 인과 역류: 기둥을 아래에서부터 다시 판정한다.
 * 쌓기 규칙(§8)을 어긴 첫 주사위와 그 위 주사위들이 무너진다.
 * @returns [남은 기둥, 무너진 주사위(아래부터)]
 */
export function backflow(pillar: Pillar): [Pillar, Pillar] {
  for (let i = 1; i < pillar.length; i++) {
    const below = pillar[i - 1]
    const cur = pillar[i]
    if (below && cur && !canStackOn(below.orientation.top, cur.orientation.top)) {
      return [pillar.slice(0, i), pillar.slice(i)]
    }
  }
  return [pillar, []]
}

/** 보드의 모든 기둥에 인과 역류를 판정하고, 무너진 주사위를 잔해로 보낸다 */
function collapsePlayer(player: PlayerState): PlayerState {
  const fallen: Die[] = []
  const cells = player.board.cells.map((row) =>
    row.map((pillar) => {
      const [kept, lost] = backflow(pillar)
      fallen.push(...lost.map((d) => ({ id: d.id, color: d.color })))
      return kept
    }),
  )
  if (fallen.length === 0) return player
  return { ...player, board: { cells }, debris: [...player.debris, ...fallen] }
}

function timeOf(state: GameState): TimeState {
  if (!state.time) throw new Error('4라운드 상태가 없습니다.')
  return state.time
}

/** 4라운드 준비 (§9 준비): 사건 카드를 섞어 3장을 시간축에 놓고 t1을 공개 */
export function startRound4(state: GameState): GameState {
  const [deck, rng] = shuffle(state.rng, EVENT_DECK)
  const time: TimeState = {
    timeline: deck.slice(0, TIMELINE_LENGTH),
    step: 0,
    revealed: 1,
    counted: [],
    remaining: [],
    done: [],
  }
  return beginStep({ ...state, rng, time }, 0)
}

/** 시점 시작: ① 미래 엿보기 → ② 시간 세기 */
export function beginStep(state: GameState, step: number): GameState {
  const time = timeOf(state)
  const event = time.timeline[step]
  const modifier = event ? (EVENTS[event].timeModifier ?? 0) : 0
  const counted = state.players.map((p) => Math.max(0, countTimeTops(p.board) + modifier))
  const next: TimeState = {
    ...time,
    step,
    revealed: Math.min(step + 2, time.timeline.length),
    counted,
    remaining: counted.slice(),
    // 돌릴 횟수가 없으면 할 일이 없으므로 바로 완료
    done: counted.map((n) => n === 0),
  }
  return finishStepIfDone({ ...state, time: next })
}

/** ⑤ 사건 해결: 사건 효과를 적용하고, 바뀐 기둥의 인과 역류를 판정한다 */
export function resolveEvent(state: GameState, event: EventDef): GameState {
  const after = event.resolve ? event.resolve(state) : state
  // TODO(5단계): 4라운드 목표 카드 달성 확인
  return { ...after, players: after.players.map(collapsePlayer) }
}

function finishStepIfDone(state: GameState): GameState {
  const time = timeOf(state)
  if (!time.done.every(Boolean)) return state
  const event = time.timeline[time.step]
  const resolved = event ? resolveEvent(state, EVENTS[event]) : state
  if (time.step + 1 < time.timeline.length) return beginStep(resolved, time.step + 1)
  return { ...resolved, phase: { kind: 'ended' } }
}

function setAt<T>(items: readonly T[], i: number, value: T): T[] {
  return items.map((x, j) => (j === i ? value : x))
}

export function applyTimeAction(state: GameState, action: TimeAction): GameState {
  const time = timeOf(state)
  const player = state.players[action.player]
  if (!player) fail(`없는 플레이어입니다 (${action.player})`)
  if (time.done[action.player]) fail('이번 시점의 돌리기를 이미 마쳤습니다.')

  switch (action.type) {
    case 'endStep':
      return finishStepIfDone({ ...state, time: { ...time, done: setAt(time.done, action.player, true) } })

    case 'rotate': {
      const remaining = time.remaining[action.player] ?? 0
      if (remaining <= 0) fail('이번 시점에 남은 돌리기 횟수가 없습니다.')
      if (!TIP_DIRECTIONS.includes(action.direction)) fail(`없는 돌리기 방향입니다 (${String(action.direction)})`)
      const pillar = player.board.cells[action.row]?.[action.col]
      const target = pillar?.[action.level]
      if (!pillar || !target) fail(`(${action.row}, ${action.col}) ${action.level + 1}층에는 주사위가 없습니다.`)

      // §9 ③ 위 주사위들은 순서와 방향 그대로 다시 올리므로, 대상 주사위의 방향만 바뀐다
      const rotated = setAt(pillar, action.level, { ...target, orientation: tip(target.orientation, action.direction) })
      const cells = player.board.cells.map((row, r) => row.map((p, c) => (r === action.row && c === action.col ? rotated : p)))
      // §9 ④ 돌릴 때마다 즉시 그 기둥을 다시 판정
      const updated = collapsePlayer({ ...player, board: { cells } })

      const left = remaining - 1
      const next: TimeState = {
        ...time,
        remaining: setAt(time.remaining, action.player, left),
        done: setAt(time.done, action.player, left === 0),
      }
      return finishStepIfDone({ ...state, players: setAt(state.players, action.player, updated), time: next })
    }
  }
}

/** 이 플레이어가 지금 할 수 있는 4라운드 행동 */
export function legalTimeActions(state: GameState, playerId: number): TimeAction[] {
  const time = state.time
  const player = state.players[playerId]
  if (state.phase.kind !== 'round' || state.phase.round !== 4 || !time || !player || time.done[playerId]) return []
  const out: TimeAction[] = []
  if ((time.remaining[playerId] ?? 0) > 0) {
    player.board.cells.forEach((row, r) =>
      row.forEach((pillar, c) =>
        pillar.forEach((_, level) => {
          for (const direction of TIP_DIRECTIONS) {
            out.push({ type: 'rotate', player: playerId, row: r, col: c, level, direction })
          }
        }),
      ),
    )
  }
  out.push({ type: 'endStep', player: playerId })
  return out
}
