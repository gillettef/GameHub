import { describe, expect, it } from 'vitest'
import { TIME } from '../dice'
import { neighborSteps, scoreLine, scorePlane, scoreTower, stepRuns } from '../scoring'
import type { RolledDie } from '../types'
import { board, colorsWith, die, line } from './helpers'

describe('숫자 연속 구간 (1씩 오르거나 내림)', () => {
  it('3칸 이상만 센다', () => {
    expect(stepRuns([1, 2])).toEqual([])
    expect(stepRuns([1, 2, 3])).toEqual([3])
    expect(stepRuns([5, 4, 3, 2, 1])).toEqual([5])
  })

  it('⧗(null)에서 끊긴다', () => {
    expect(stepRuns([1, 2, null, 3, 4])).toEqual([])
    expect(stepRuns([1, 2, 3, null, 5])).toEqual([3])
  })

  it('방향이 바뀌는 칸은 앞뒤 구간에 모두 속한다', () => {
    expect(stepRuns([1, 2, 3, 2, 1])).toEqual([3, 3])
    expect(stepRuns([1, 2, 1, 2, 1])).toEqual([])
  })

  it('같은 숫자나 2 이상 차이는 끊는다', () => {
    expect(stepRuns([1, 2, 2, 3, 4])).toEqual([3])
    expect(stepRuns([1, 3, 4, 5])).toEqual([3])
  })
})

describe('§6 1차원 기본 점수: 가장 긴 같은 색 연속', () => {
  it('선에서 가로로 이어진 같은 색 주사위 수의 최댓값', () => {
    const r = 'red'
    expect(scoreLine(board(line(die(r, 1), die('blue', 1), die('green', 1), die('yellow', 1), die('black', 1)))).total).toBe(1)
    expect(scoreLine(board(line(die(r, 1), die(r, 1), die(r, 1), die('green', 1), die('yellow', 1)))).total).toBe(3)
    expect(scoreLine(board(line(die(r, 1), die(r, 2), die(r, 3), die(r, 4), die(r, 5)))).total).toBe(5)
  })

  it('규칙서 예: 빨강-빨강-파랑-빨강-빨강 = 2점 (떨어진 구간은 합치지 않음)', () => {
    expect(scoreLine(board(line(die('red', 1), die('red', 1), die('blue', 1), die('red', 1), die('red', 1)))).total).toBe(2)
  })

  it('규칙서 예: 초록-초록-초록-⧗-초록 = 3점 (⧗ 윗면은 무색이라 끊김)', () => {
    const g = 'green'
    expect(scoreLine(board(line(die(g, 1), die(g, 2), die(g, 3), die(g, TIME), die(g, 4)))).total).toBe(3)
  })

  it('규칙서 예: 모두 ⧗ = 0점, 빈 선 = 0점', () => {
    expect(scoreLine(board(line(...[1, 2, 3, 4, 5].map(() => die('red', TIME))))).total).toBe(0)
    expect(scoreLine(board({})).total).toBe(0)
  })

  it('숫자 연속은 더 이상 점수가 아니다 (v0.7)', () => {
    const b = board(line(die('red', 1), die('blue', 2), die('green', 3), die('yellow', 4), die('black', 5)))
    expect(scoreLine(b).total).toBe(1)
  })

  it('색은 주사위가 아니라 윗면이 정한다: 같은 면 색 배치라도 윗면이 다르면 색이 다르다', () => {
    const colors = colorsWith('red', 1) // 1 빨강, 2 파랑, ...
    const d = (top: 1 | 2): RolledDie => ({ ...die('red', top), colors })
    expect(scoreLine(board(line(d(1), d(1), d(2), d(2), d(2)))).total).toBe(3)
  })
})

describe('§7 2차원 기본 점수: 가장 넓은 같은 색 영역', () => {
  it('선을 포함해 변으로 이어진 같은 색 묶음 중 가장 큰 것의 크기', () => {
    const b = board({
      ...line(die('red', 1), die('blue', 1), die('green', 1), die('yellow', 1), die('black', 1)),
      '1,0': [die('red', 1)],
      '2,0': [die('red', 1)],
      '1,4': [die('black', 1)],
    })
    expect(scorePlane(b).total).toBe(3)
  })

  it('여러 영역이 있어도 가장 큰 하나만, 대각선은 이어지지 않음', () => {
    const b = board({
      '0,0': [die('red', 1)],
      '1,1': [die('red', 1)],
      '0,3': [die('blue', 1)],
      '0,4': [die('blue', 1)],
    })
    expect(scorePlane(b).total).toBe(2)
  })

  it('⧗ 윗면은 영역을 끊는다', () => {
    const b = board({ '1,0': [die('red', 1)], '1,1': [die('red', TIME)], '1,2': [die('red', 1)] })
    expect(scorePlane(b).total).toBe(1)
  })

  it('평면 점수는 1층 주사위만 본다', () => {
    const b = board({ '0,0': [die('red', 2), die('blue', 5)], '0,1': [die('red', 3)] })
    expect(scorePlane(b).total).toBe(2)
  })
})

describe('이웃 계단 쌍 수 (v0.7부터 목표 계단 사슬에만 씀)', () => {
  it('변으로 맞닿은 두 윗면이 1 차이면 1쌍 (대각선 제외, ⧗ 제외, 선 안 가로 쌍 제외)', () => {
    const b = board({
      '0,0': [die('red', 2)],
      '0,1': [die('blue', 3)],
      '1,0': [die('green', 3)],
      '1,1': [die('yellow', 5)],
      '0,2': [die('black', TIME)],
    })
    expect(neighborSteps(b)).toBe(1)
  })
})

describe('§8 3차원 기본 점수: 가장 높은 같은 색 세로 연속', () => {
  it('규칙서 예: 아래부터 빨강 1 → 빨강 3 → 파랑 4 → 빨강 5 = 2점', () => {
    const b = board({ '1,0': [die('red', 1), die('red', 3), die('blue', 4), die('red', 5)] })
    expect(scoreTower(b).total).toBe(2)
  })

  it('1층(평면 주사위)을 포함하고, 기둥이 여럿이면 가장 높은 연속 하나만', () => {
    const b = board({
      '0,0': [die('blue', 1), die('blue', 2), die('blue', 3), die('blue', 4)],
      '1,0': [die('red', 1), die('red', 2), die('red', 3)],
    })
    expect(scoreTower(b).total).toBe(4)
  })

  it('옆 기둥끼리는 이어지지 않는다', () => {
    const b = board({ '1,0': [die('red', 1), die('red', 2)], '1,1': [die('red', 1), die('red', 2)] })
    expect(scoreTower(b).total).toBe(2)
  })

  it('꼭대기 ⧗은 무색이라 연속에 들지 않는다', () => {
    const b = board({ '1,0': [die('green', 1), die('green', 2), die('green', TIME)] })
    expect(scoreTower(b).total).toBe(2)
  })

  it('높이 자체는 점수가 아니다: 색이 모두 다르면 1점', () => {
    const b = board({ '1,0': [die('red', 1), die('blue', 2), die('green', 3), die('yellow', 4), die('black', 5)] })
    expect(scoreTower(b).total).toBe(1)
  })

  it('공허의 우주: 세로 연속에서도 검정이 이어 준다', () => {
    const b = board({ '1,0': [die('red', 1), die('black', 2), die('red', 3)] })
    expect(scoreTower(b, 'void').total).toBe(3)
    expect(scoreTower(b, 'standard').total).toBe(1)
  })
})
