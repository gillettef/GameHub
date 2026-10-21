import { describe, expect, it } from 'vitest'
import { TIME } from '../dice'
import { pillarHeightPoints, scoreLine, scorePlane, scoreTower, stepRuns } from '../scoring'
import { board, die, line } from './helpers'

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

describe('§6 1차원 기본 점수', () => {
  it('같은 색 연속 2/3/4/5칸 = 1/3/6/10점', () => {
    const r = 'red'
    expect(scoreLine(board(line(die(r, 1), die(r, 1), die('blue', 1), die('green', 1), die('yellow', 1)))).colorRuns).toBe(1)
    expect(scoreLine(board(line(die(r, 1), die(r, 1), die(r, 1), die('green', 1), die('yellow', 1)))).colorRuns).toBe(3)
    expect(scoreLine(board(line(die(r, 1), die(r, 1), die(r, 1), die(r, 1), die('yellow', 1)))).colorRuns).toBe(6)
    expect(scoreLine(board(line(die(r, 1), die(r, 1), die(r, 1), die(r, 1), die(r, 1)))).colorRuns).toBe(10)
  })

  it('떨어진 같은 색 구간은 따로 센다: 빨빨 파 빨빨 = 1 + 1', () => {
    const b = board(line(die('red', 1), die('red', 1), die('blue', 1), die('red', 1), die('red', 1)))
    expect(scoreLine(b).colorRuns).toBe(2)
  })

  it('윗면 연속 3칸 이상은 칸 수만큼, ⧗에서 끊김', () => {
    const b = board(line(die('red', 1), die('blue', 2), die('green', 3), die('yellow', 4), die('black', TIME)))
    expect(scoreLine(b)).toEqual({ colorRuns: 0, stepRuns: 4, total: 4 })
  })
})

describe('§7 2차원 기본 점수', () => {
  it('크기 3 이상 같은 색 영역(선 포함)은 크기만큼', () => {
    const b = board({
      ...line(die('red', 1), die('blue', 1), die('green', 1), die('yellow', 1), die('black', 1)),
      '1,0': [die('red', 1)],
      '2,0': [die('red', 1)],
      '1,4': [die('black', 1)],
    })
    expect(scorePlane(b).regions).toBe(3)
  })

  it('이웃 계단: 변으로 맞닿은 두 윗면이 1 차이면 쌍마다 1점 (대각선 제외, ⧗ 제외)', () => {
    const b = board({
      '0,0': [die('red', 2)],
      '0,1': [die('blue', 3)],
      '1,0': [die('green', 3)],
      '1,1': [die('yellow', 5)],
      '0,2': [die('black', TIME)],
    })
    // (0,0)-(0,1): 선 안의 쌍이라 제외, (0,0)-(1,0): 2-3 ○, (0,1)-(1,1): 3-5 ×, (1,0)-(1,1): 3-5 ×
    expect(scorePlane(b).neighborSteps).toBe(1)
  })

  it('이웃 계단: 선(1행) 안의 가로 쌍은 세지 않고, 선과 2행 사이 쌍은 센다', () => {
    const b = board({
      ...line(die('red', 1), die('red', 2), die('red', 3), die('red', 4), die('red', 5)),
      '1,0': [die('blue', 2)],
    })
    expect(scorePlane(b).neighborSteps).toBe(1)
  })

  it('평면 점수는 1층 주사위만 본다', () => {
    const b = board({ '0,0': [die('red', 2), die('red', 5)], '1,0': [die('blue', 3)] })
    expect(scorePlane(b).neighborSteps).toBe(1)
  })
})

describe('§8 3차원 기본 점수', () => {
  it('높은 기둥: 3/4/5/6층 이상 = 3/6/10/15점, 2층 이하 0점', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(pillarHeightPoints)).toEqual([0, 0, 3, 6, 10, 15, 15])
  })

  it('정면 숫자선: 맨 앞줄 꼭대기 앞면 연속 3칸 이상 × 2', () => {
    const b = board({
      '0,0': [die('red', 1, 2)],
      '0,1': [die('red', 2, 3)],
      '0,2': [die('red', 1), die('red', 2, 4)],
      '0,3': [die('red', 2, TIME)],
      '0,4': [die('red', 1, 5)],
    })
    expect(scoreTower(b).frontLine).toBe(6)
  })

  it('기둥 점수 합계', () => {
    const tall = [die('red', 1), die('red', 2), die('red', 3), die('red', 4)]
    const b = board({ '0,0': tall, '1,0': [die('red', 1), die('red', 2), die('red', 3)] })
    expect(scoreTower(b).pillars).toBe(9)
  })
})
