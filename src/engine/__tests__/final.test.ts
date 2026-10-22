import { describe, expect, it } from 'vitest'
import { TIME } from '../dice'
import { finalScores, winners } from '../final'
import { createGame } from '../setup'
import type { Board, GameState } from '../types'
import { board, die, line } from './helpers'

function ended(players: { board: Board; planeScore: number; debris: number }[]): GameState {
  const base = createGame({ playerCount: players.length, seed: 1 })
  return {
    ...base,
    phase: { kind: 'ended' },
    players: base.players.map((p, i) => {
      const x = players[i] as (typeof players)[number]
      return {
        ...p,
        board: x.board,
        planeScore: x.planeScore,
        debris: Array.from({ length: x.debris }, (_, k) => ({ id: 9000 + i * 100 + k, color: 'red' as const })),
      }
    }),
  }
}

describe('§10 최종 점수', () => {
  it('1차원(최종 선) + 2차원(확정분) + 3차원(최종 탑) − 잔해', () => {
    // 선: 빨강 5칸 연속 10점 + 1-2-3-4-5 숫자 연속 5점 = 15
    // 탑: (0,0) 3층 3점, 앞면은 연속 없음
    const b = board({
      ...line(die('red', 1), die('red', 2), die('red', 3), die('red', 4), die('red', 5)),
      '0,0': [die('red', 1), die('red', 2), die('red', TIME)],
    })
    const [s] = finalScores(ended([{ board: b, planeScore: 7, debris: 2 }, { board: board({}), planeScore: 0, debris: 0 }]))
    expect(s).toMatchObject({ player: 0, plane: 7, tower: 3, debris: -2 })
    expect(s?.line).toBe(10 + 5) // (0,0)이 1-2-⧗ 기둥이어도 선 주사위는 1층 1 → 1-2-3-4-5 그대로
    expect(s?.total).toBe((s?.line ?? 0) + 7 + 3 - 2)
  })

  it('2차원 점수는 현재 평면이 아니라 2라운드에 확정한 점수를 쓴다', () => {
    // 지금 평면은 빨강 영역 3 → 3점이지만 확정분은 0
    const b = board({ '0,0': [die('red', 1)], '1,0': [die('red', 1)], '2,0': [die('red', 1)] })
    const [s] = finalScores(ended([{ board: b, planeScore: 0, debris: 0 }, { board: board({}), planeScore: 0, debris: 0 }]))
    expect(s?.plane).toBe(0)
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

  it('완전히 같으면 공동 순위', () => {
    const s = ended([
      { board: board({}), planeScore: 3, debris: 0 },
      { board: board({}), planeScore: 3, debris: 0 },
      { board: board({}), planeScore: 1, debris: 0 },
    ])
    expect(finalScores(s).map((x) => x.rank)).toEqual([1, 1, 3])
    expect(winners(s)).toEqual([0, 1])
  })
})
