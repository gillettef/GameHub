import { describe, expect, it } from 'vitest'
import { TIME, type Face } from '../dice'
import { canStackOn, legalCells } from '../placement'
import { createBoard } from '../setup'
import { board, die, line } from './helpers'

const cells = (list: { row: number; col: number }[]) => list.map((c) => `${c.row},${c.col}`).sort()

describe('§6 1라운드 선 놓기', () => {
  it('첫 주사위는 가운데 칸(3번)에만', () => {
    expect(cells(legalCells(createBoard(), 1, die('red', 3)))).toEqual(['0,2'])
  })

  it('그다음은 현재 선의 왼쪽 끝 또는 오른쪽 끝', () => {
    const b = board({ '0,2': [die('red', 3)] })
    expect(cells(legalCells(b, 1, die('red', 1)))).toEqual(['0,1', '0,3'])
    const b2 = board({ '0,1': [die('red', 3)], '0,2': [die('red', 3)], '0,3': [die('red', 3)] })
    expect(cells(legalCells(b2, 1, die('red', 1)))).toEqual(['0,0', '0,4'])
  })

  it('한쪽 끝에 닿으면 반대쪽만', () => {
    const b = board({ '0,0': [die('red', 3)], '0,1': [die('red', 3)], '0,2': [die('red', 3)] })
    expect(cells(legalCells(b, 1, die('red', 1)))).toEqual(['0,3'])
  })
})

describe('§7 2라운드 평면 놓기', () => {
  const full = () => line(die('red', 1), die('red', 1), die('red', 1), die('red', 1), die('red', 1))

  it('선이 다 찼을 때 2행 5칸 모두 가능, 3행은 아직 불가', () => {
    expect(cells(legalCells(board(full()), 2, die('blue', 2)))).toEqual(['1,0', '1,1', '1,2', '1,3', '1,4'])
  })

  it('2행에 놓인 주사위 뒤의 3행 칸이 열린다', () => {
    const b = board({ ...full(), '1,3': [die('blue', 2)] })
    expect(cells(legalCells(b, 2, die('blue', 2)))).toContain('2,3')
    expect(cells(legalCells(b, 2, die('blue', 2)))).not.toContain('2,1')
  })

  it('1행(선)이나 이미 찬 칸에는 놓을 수 없다', () => {
    const b = board({ ...full(), '1,3': [die('blue', 2)] })
    const legal = cells(legalCells(b, 2, die('blue', 2)))
    expect(legal.some((k) => k.startsWith('0,'))).toBe(false)
    expect(legal).not.toContain('1,3')
  })
})

describe('§8 3라운드 쌓기 규칙', () => {
  const canStack = (below: Face, top: Face) => canStackOn(below, top)

  it('규칙서 예: 1 위에는 2·3·4·5·⧗', () => {
    expect(([2, 3, 4, 5, TIME] as Face[]).every((t) => canStack(1, t))).toBe(true)
    expect(canStack(1, 1)).toBe(false)
  })

  it('규칙서 예: 4 위에는 5·⧗, 5 위에는 ⧗만', () => {
    expect(([1, 2, 3, 4, 5, TIME] as Face[]).filter((t) => canStack(4, t))).toEqual([5, TIME])
    expect(([1, 2, 3, 4, 5, TIME] as Face[]).filter((t) => canStack(5, t))).toEqual([TIME])
  })

  it('⧗ 위는 새 출발: 무엇이든', () => {
    expect(([1, 2, 3, 4, 5, TIME] as Face[]).every((t) => canStack(TIME, t))).toBe(true)
  })

  it('같은 숫자는 쌓을 수 없다', () => {
    for (const f of [1, 2, 3, 4, 5] as Face[]) expect(canStack(f, f)).toBe(false)
  })

  it('진공(빈 칸) 위에는 쌓을 수 없고, 꼭대기 기준으로 판정한다', () => {
    const b = board({ '0,0': [die('red', 1), die('red', 4)], '0,1': [die('red', 2)], '1,1': [die('red', 5)] })
    expect(cells(legalCells(b, 3, die('blue', 3)))).toEqual(['0,1'])
    expect(cells(legalCells(b, 3, die('blue', TIME)))).toEqual(['0,0', '0,1', '1,1'])
  })
})
