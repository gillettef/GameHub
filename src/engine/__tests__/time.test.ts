import { describe, expect, it } from 'vitest'
import { TIME } from '../dice'
import { EVENT_DECK, type EventDef } from '../events'
import { applyAction, getLegalActions, IllegalActionError, type Action } from '../game'
import { scoreLine, scoreTower } from '../scoring'
import { createGame } from '../setup'
import { backflow, beginStep, countTimeTops, resolveEvent, startRound4 } from '../time'
import type { Board, EventId, GameState } from '../types'
import { board, die, line } from './helpers'

/** 무효과 사건만으로 된 시간축 */
const CALM: EventId[] = ['rotation', 'erosion', 'flood']

/** 주어진 보드들로 4라운드 t1을 시작한 상태 */
function round4(boards: Board[], timeline: EventId[] = CALM): GameState {
  const base = createGame({ playerCount: boards.length, seed: 5 })
  const s: GameState = {
    ...base,
    market: [],
    phase: { kind: 'round', round: 4 },
    players: base.players.map((p, i) => ({ ...p, board: boards[i] as Board, planeScore: 0 })),
    time: { timeline, step: 0, revealed: 1, counted: [], remaining: [], done: [] },
  }
  return beginStep(s, 0)
}

const rotate = (
  s: GameState,
  player: number,
  row: number,
  col: number,
  level: number,
  direction: 'forward' | 'back' | 'left' | 'right',
): GameState => applyAction(s, { type: 'rotate', player, row, col, level, direction })

const endStep = (s: GameState, player: number): GameState => applyAction(s, { type: 'endStep', player })

const emptyBoard = () => board({})
/** ⧗ 꼭대기 n개짜리 보드 (2행에 ⧗ 평면 주사위) */
const timeTops = (n: number) =>
  board(Object.fromEntries(Array.from({ length: n }, (_, c) => [`1,${c}`, [die('black', TIME)]])))

describe('§9 준비', () => {
  it('사건 카드 3장을 시간축에 놓고, t1과 다음 사건(t2)이 보인다', () => {
    const base = createGame({ playerCount: 2, seed: 3 })
    const players = base.players.map((p) => ({ ...p, board: timeTops(2) })) // 시간 균열이어도 1회 남음
    const s = startRound4({ ...base, players, market: [], phase: { kind: 'round', round: 4 } })
    expect(s.time?.timeline).toHaveLength(3)
    expect(new Set(s.time?.timeline).size).toBe(3)
    for (const e of s.time?.timeline ?? []) expect(EVENT_DECK).toContain(e)
    expect(s.time?.step).toBe(0)
    expect(s.time?.revealed).toBe(2)
  })
})

describe('§9 ② 시간 세기', () => {
  it('윗면이 ⧗인 꼭대기만 센다. 기둥 속 ⧗은 세지 않는다', () => {
    const b = board({
      '0,0': [die('red', 1), die('red', TIME)],
      '0,1': [die('red', TIME), die('red', 3)],
      '1,0': [die('blue', TIME)],
    })
    expect(countTimeTops(b)).toBe(2)
    expect(round4([b, emptyBoard()]).time?.counted).toEqual([2, 0])
  })

  it('횟수는 시점 시작에 정해지고, 돌리는 도중 ⧗ 꼭대기가 줄어도 바뀌지 않는다', () => {
    let s = round4([timeTops(2), timeTops(1)])
    s = rotate(s, 0, 1, 0, 0, 'forward') // ⧗ 꼭대기를 돌려 없앰
    expect(countTimeTops(s.players[0]?.board as Board)).toBe(1)
    expect(s.time?.counted[0]).toBe(2)
    expect(s.time?.remaining[0]).toBe(1)
  })

  it('역행은 현재 시점의 횟수 +1, 시간 균열은 -1 (최소 0)', () => {
    expect(round4([timeTops(2), emptyBoard()], ['regression', 'erosion', 'flood']).time?.counted).toEqual([3, 1])
    expect(round4([timeTops(2), emptyBoard()], ['timeRift', 'erosion', 'flood']).time?.counted).toEqual([1, 0])
  })

  it('다음 시점이 되면 그때의 ⧗ 꼭대기로 다시 센다', () => {
    let s = round4([timeTops(1), timeTops(1)])
    s = rotate(s, 0, 1, 0, 0, 'forward') // 0번은 ⧗ 꼭대기를 잃음 → 자동 완료
    s = endStep(s, 1)
    expect(s.time?.step).toBe(1)
    expect(s.time?.counted).toEqual([0, 1])
  })
})

describe('§9 ③ 돌리기', () => {
  it('같은 주사위를 여러 번 돌릴 수 있다 (1회 = 90°)', () => {
    let s = round4([timeTops(2), emptyBoard()])
    s = rotate(s, 0, 1, 0, 0, 'back')
    s = rotate(s, 0, 1, 0, 0, 'back')
    // ⧗ → 앞면 → 반대편(1)
    expect(s.players[0]?.board.cells[1]?.[0]?.[0]?.orientation.top).toBe(1)
  })

  it('기둥 속 주사위를 돌리면 위 주사위들은 순서와 방향 그대로다', () => {
    const top = die('green', TIME)
    const b = board({ '1,0': [die('red', TIME), die('blue', 2), top] })
    let s = round4([b, emptyBoard()])
    s = rotate(s, 0, 1, 0, 1, 'back') // 2층 2 → 다른 숫자/⧗, 아래가 ⧗라 언제나 합법
    const pillar = s.players[0]?.board.cells[1]?.[0]
    expect(pillar).toHaveLength(3)
    expect(pillar?.[2]).toEqual(top)
  })

  it('남은 횟수가 없으면 돌릴 수 없고, 마친 플레이어는 행동할 수 없다', () => {
    const s = round4([timeTops(1), timeTops(1)])
    expect(() => rotate(s, 1, 1, 1, 0, 'forward')).toThrow(IllegalActionError) // 빈 칸
    const s1 = endStep(s, 0)
    expect(() => rotate(s1, 0, 1, 0, 0, 'forward')).toThrow(IllegalActionError)
    expect(() => endStep(s1, 0)).toThrow(IllegalActionError)
  })

  it('모두 동시에: 다른 플레이어가 끝나지 않아도 각자 돌린다', () => {
    let s = round4([timeTops(1), timeTops(1)])
    s = rotate(s, 1, 1, 0, 0, 'forward')
    expect(s.time?.step).toBe(0)
    expect(s.time?.done).toEqual([false, true])
    s = rotate(s, 0, 1, 0, 0, 'left')
    expect(s.time?.step).toBeGreaterThan(0)
  })

  it('남은 횟수는 다음 시점으로 넘어가지 않는다', () => {
    let s = round4([timeTops(3), emptyBoard()])
    s = endStep(s, 0)
    expect(s.time?.step).toBe(1)
    expect(s.time?.remaining[0]).toBe(3)
  })

  it('선 주사위를 돌리면 최종 선 점수에 반영된다', () => {
    // 1 2 3 ⧗ 5 → ⧗을 돌려 4로 만들면 1-2-3-4-5 숫자 연속 5칸
    const b = board({ ...line(die('red', 1), die('blue', 2), die('green', 3), die('yellow', TIME, 4), die('black', 5)) })
    let s = round4([b, emptyBoard()])
    expect(scoreLine(s.players[0]?.board as Board).stepRuns).toBe(3)
    // 윗면 ⧗, 앞면 4 → back으로 돌리면 앞면(4)이 윗면
    s = rotate(s, 0, 0, 3, 0, 'back')
    expect(scoreLine(s.players[0]?.board as Board).stepRuns).toBe(5)
  })

  it('없는 방향으로는 돌릴 수 없다 (직렬화된 행동 검증)', () => {
    const s = round4([timeTops(1), emptyBoard()])
    const bad = { type: 'rotate', player: 0, row: 1, col: 0, level: 0, direction: 'up' } as unknown as Action
    expect(() => applyAction(s, bad)).toThrow(IllegalActionError)
  })

  it('꼭대기를 돌리면 정면 숫자선(앞면)에도 반영된다', () => {
    // 앞줄 꼭대기 앞면 1-2-3
    const b = board({
      '0,0': [die('red', 2, 1)],
      '0,1': [die('red', 1, 2)],
      '0,2': [die('red', 2, 3)],
      '1,0': [die('black', TIME)],
    })
    let s = round4([b, emptyBoard()])
    expect(scoreTower(s.players[0]?.board as Board).frontLine).toBe(6) // 1-2-3
    // (0,2) 윗면 2를 forward로 → 앞면이 2가 됨 → 1-2-2
    s = rotate(s, 0, 0, 2, 0, 'forward')
    expect(scoreTower(s.players[0]?.board as Board).frontLine).toBe(0)
  })

  it('합법 행동: 마치지 않은 모든 플레이어의 돌리기와 완료', () => {
    const s = round4([timeTops(1), emptyBoard()])
    const actions = getLegalActions(s)
    expect(actions).toContainEqual({ type: 'endStep', player: 0 })
    expect(actions.filter((a) => a.type === 'rotate')).toHaveLength(4)
    expect(actions.every((a) => a.player === 0)).toBe(true)
  })
})

describe('§9 ④ 인과 역류', () => {
  // 1 → 3 → 5 기둥 (1층 1의 앞면 2, 오른면 4, 왼면 3)
  const tower = () => board({ '1,0': [die('red', 1, 2), die('blue', 3), die('green', 5)], '1,1': [die('black', TIME)] })

  it('예: 1을 돌려 4로 만들면 바로 위의 3이 규칙을 어기므로 3과 5가 무너진다', () => {
    let s = round4([tower(), emptyBoard()])
    s = rotate(s, 0, 1, 0, 0, 'left') // 윗면 ← 오른면 4
    expect(s.players[0]?.board.cells[1]?.[0]?.map((d) => d.orientation.top)).toEqual([4])
    expect(s.players[0]?.debris.map((d) => d.color)).toEqual(['blue', 'green'])
  })

  it('예: 1층 1을 돌려 2로 만들면 기둥은 그대로다', () => {
    let s = round4([tower(), emptyBoard()])
    s = rotate(s, 0, 1, 0, 0, 'back') // 윗면 ← 앞면 2
    expect(s.players[0]?.board.cells[1]?.[0]?.map((d) => d.orientation.top)).toEqual([2, 3, 5])
    expect(s.players[0]?.debris).toEqual([])
  })

  it('⧗ 위 새 출발을 돌리기로 깨면 그 위가 무너진다', () => {
    // ⧗(앞면 2) → 1 기둥: ⧗을 돌려 2로 만들면 1이 규칙을 어김
    let s = round4([board({ '1,0': [die('red', TIME, 2), die('blue', 1)], '1,1': [die('black', TIME)] }), emptyBoard()])
    s = rotate(s, 0, 1, 0, 0, 'back')
    expect(s.players[0]?.board.cells[1]?.[0]?.map((d) => d.orientation.top)).toEqual([2])
    expect(s.players[0]?.debris).toHaveLength(1)
  })

  it('backflow: 쌓기 규칙을 처음 어긴 주사위와 그 위를 무너뜨린다 (⧗ 규칙 포함)', () => {
    const [kept, lost] = backflow([die('red', 2), die('red', TIME), die('red', 1), die('red', 1), die('red', 5)])
    expect(kept.map((d) => d.orientation.top)).toEqual([2, TIME, 1])
    expect(lost.map((d) => d.orientation.top)).toEqual([1, 5])
  })
})

describe('§9 ⑤ 사건 해결과 §10 게임 종료', () => {
  it('사건으로 바뀐 주사위도 인과 역류를 판정한다', () => {
    const s = round4([board({ '1,0': [die('red', 1, 2), die('blue', 3)] }), emptyBoard()])
    const flipBottom: EventDef = {
      id: 'rotation',
      name: '테스트',
      resolve: (st) => ({
        ...st,
        players: st.players.map((p) => ({
          ...p,
          board: { cells: p.board.cells.map((row) => row.map((pl) => pl.map((d, i) => (i === 0 ? { ...d, orientation: { top: 5, front: 1 } } : d)))) },
        })),
      }),
    }
    const after = resolveEvent(s, flipBottom)
    expect(after.players[0]?.board.cells[1]?.[0]).toHaveLength(1)
    expect(after.players[0]?.debris).toHaveLength(1)
  })

  it('모두 마치면 다음 시점으로, t3 사건을 해결하면 게임이 끝난다', () => {
    let s = round4([timeTops(1), timeTops(1)])
    expect(s.time?.revealed).toBe(2)
    s = endStep(endStep(s, 0), 1)
    expect(s.time?.step).toBe(1)
    expect(s.time?.revealed).toBe(3)
    s = endStep(endStep(s, 0), 1)
    expect(s.time?.step).toBe(2)
    expect(s.time?.revealed).toBe(3)
    s = endStep(endStep(s, 0), 1)
    expect(s.phase).toEqual({ kind: 'ended' })
    expect(getLegalActions(s)).toEqual([])
    expect(() => endStep(s, 0)).toThrow(IllegalActionError)
  })

  it('사건 해결은 모든 플레이어가 마친 뒤에만 한다', () => {
    let s = round4([board({ '1,0': [die('red', 1, 2), die('blue', 3)], '1,1': [die('black', TIME)] }), timeTops(1)], ['erosion', 'flood', 'rotation'])
    s = rotate(s, 0, 1, 0, 0, 'left') // 0번 완료 (1 → 4, 3 무너짐)
    expect(s.time?.step).toBe(0)
    expect(s.players[0]?.debris).toHaveLength(1)
    s = endStep(s, 1)
    expect(s.time?.step).toBe(1)
  })

  it('모두 돌릴 횟수가 0이면 시점이 바로 지나간다', () => {
    expect(round4([emptyBoard(), emptyBoard()]).phase).toEqual({ kind: 'ended' })
  })

  it('4라운드에는 1~3라운드 행동을 할 수 없다', () => {
    const s = round4([timeTops(1), timeTops(1)])
    const take: Action = { type: 'takeSlot', player: s.currentPlayer, slot: 0 }
    expect(() => applyAction(s, take)).toThrow(IllegalActionError)
  })
})
