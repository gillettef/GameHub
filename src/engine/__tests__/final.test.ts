import { describe, expect, it } from 'vitest'
import { STANDARD_LAYOUT } from '../dice'
import { finalScores, winners } from '../final'
import { createGame } from '../setup'
import type { Board, GameState } from '../types'
import { board, colorsWith, die, line } from './helpers'

interface Ended {
  board: Board
  lineScore?: number | null
  planeScore?: number | null
  towerScore?: number | null
  debris: number
}

function ended(players: Ended[]): GameState {
  const base = createGame({ playerCount: players.length, seed: 1, law: 'standard' })
  return {
    ...base,
    phase: { kind: 'ended' },
    players: base.players.map((p, i) => {
      const x = players[i] as Ended
      return {
        ...p,
        board: x.board,
        lineScore: x.lineScore === undefined ? 0 : x.lineScore,
        planeScore: x.planeScore === undefined ? 0 : x.planeScore,
        towerScore: x.towerScore === undefined ? 0 : x.towerScore,
        debris: Array.from({ length: x.debris }, (_, k) => ({ id: 9000 + i * 100 + k, colors: colorsWith('red', 1), layout: STANDARD_LAYOUT })),
      }
    }),
  }
}

describe('§10 최종 점수', () => {
  it('1·2·3차원은 라운드 끝에 확정한 점수 − 잔해', () => {
    const [s] = finalScores(
      ended([
        { board: board({}), lineScore: 4, planeScore: 7, towerScore: 3, debris: 2 },
        { board: board({}), debris: 0 },
      ]),
    )
    expect(s).toMatchObject({ player: 0, line: 4, plane: 7, tower: 3, debris: -2, total: 4 + 7 + 3 - 2 })
  })

  it('v0.7 4라운드에 보드가 바뀌어도 확정 점수를 쓴다 (지금 보드로 다시 계산하지 않음)', () => {
    // 지금 보드: 선 빨강 5칸, 평면 영역 5, 기둥 빨강 세로 3 → 하지만 확정분은 모두 1
    const b = board({
      ...line(die('red', 1), die('red', 2), die('red', 3), die('red', 4), die('red', 5)),
      '0,0': [die('red', 1), die('red', 2), die('red', 3)],
    })
    const [s] = finalScores(ended([{ board: b, lineScore: 1, planeScore: 1, towerScore: 1, debris: 0 }, { board: board({}), debris: 0 }]))
    expect(s).toMatchObject({ line: 1, plane: 1, tower: 1 })
  })

  it('확정 전(null)이면 지금 보드로 계산한다 (테스트·중간 표시용)', () => {
    const b = board({
      ...line(die('red', 1), die('red', 2), die('blue', 3), die('red', 4), die('red', 5)),
      '1,0': [die('red', 1)],
      '0,4': [die('red', 5)],
    })
    const [s] = finalScores(ended([{ board: b, lineScore: null, planeScore: null, towerScore: null, debris: 0 }, { board: board({}), debris: 0 }]))
    expect(s).toMatchObject({ line: 2, plane: 3, tower: 1 })
  })

  it('동점이면 잔해가 적은 사람, 그래도 동점이면 가장 높은 기둥이 높은 사람', () => {
    const flat = board({ '1,0': [die('red', 1)] })
    const tall = board({ '1,0': [die('red', 1), die('blue', 2)] })
    // 0번: 5 − 1 = 4, 1번: 4 − 0 = 4 → 잔해 적은 1번 승
    const a = finalScores(ended([{ board: flat, planeScore: 5, debris: 1 }, { board: flat, planeScore: 4, debris: 0 }]))
    expect(a.map((x) => x.player)).toEqual([1, 0])
    expect(a.map((x) => x.rank)).toEqual([1, 2])
    // 점수·잔해 같음 → 2층 기둥이 있는 0번 승
    const b = finalScores(ended([{ board: tall, planeScore: 4, debris: 0 }, { board: flat, planeScore: 4, debris: 0 }]))
    expect(b.map((x) => x.player)).toEqual([0, 1])
  })

  it('§10 완전히 같으면 공동 순위, 공동 승리', () => {
    const s = ended([
      { board: board({}), planeScore: 3, debris: 0 },
      { board: board({}), planeScore: 3, debris: 0 },
      { board: board({}), planeScore: 1, debris: 0 },
    ])
    expect(finalScores(s).map((x) => x.rank)).toEqual([1, 1, 3])
    expect(winners(s)).toEqual([0, 1])
  })
})
