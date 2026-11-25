// 옛 test/engine.test.mjs(node --test)를 vitest 로 옮긴 것. 규칙 엔진·봇 단위 검사.
import { describe, expect, it } from 'vitest'
import { PERSONA_IDS, assertion, chooseClaim, chooseQuestion, newBrain, onForget, testimony } from '../src/engine/bot'
import { RuleError, allowedTokens, ask, askableSeasons, claim, fist, newGame, say, start, tally, tick, view, type Game } from '../src/engine/game'
import { EMPTY, GREY, plotsFor, questionsFor } from '../src/engine/rules'

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isBot: true, persona: PERSONA_IDS[i % 4]! }))

/** 봇만으로 한 판을 끝까지 돌린다 (가상 시계) */
function playOut(n: number, seed: number) {
  const g = newGame({ players: players(n), seed })
  const brains = g.players.map((p, i) => newBrain(p.persona, seed + i))
  const hook = (s: number, col: (number | null)[]) => brains.forEach((b, i) => onForget(g, b, i, s, col))
  let now = 0
  let questions = 0
  start(g, now)
  for (let step = 0; step < 5000 && g.phase !== 'ended'; step++) {
    now += 1000
    if (g.phase === 'claim') brains.forEach((b, i) => g.phase === 'claim' && claim(g, i, chooseClaim(g, b), now))
    else if (g.phase === 'choose') {
      const q = chooseQuestion(g, brains[g.questioner]!, g.questioner)
      ask(g, g.questioner, q.plot, q.season, now)
      questions++
    } else if (g.phase === 'whisper') {
      brains.forEach((b, i) => {
        const a = assertion(g, b, i)
        if (a) say(g, i, a.text, now, a.answer ? { answer: a.answer } : null)
      })
      brains.forEach((b, i) => g.phase === 'whisper' && fist(g, i, testimony(g, b, i), now))
    } else {
      tick(g, now + 60_000, hook)
      if ((g.phase as string) === 'claim') expect(view(g, 0, now).question, '새 계절에는 지난 질문 칸 표시가 없다').toBeNull()
    }
  }
  return { g, questions }
}

const claimAll = (g: Game, plots: string[], now: number) => plots.forEach((p, i) => claim(g, i, p, now))

describe('규칙 엔진', () => {
  it('인원별 구역 수와 질문 수', () => {
    expect(plotsFor(4).length).toBe(5)
    expect(plotsFor(5).length).toBe(6)
    expect(plotsFor(6).length).toBe(7)
    const total = (n: number) => [2, 3, 4, 5, 6, 7].reduce((a, s) => a + questionsFor(n, s), 0) + questionsFor(n, 'final')
    expect(total(4)).toBe(16)
    expect(total(5)).toBe(15)
    expect(total(6)).toBe(12)
  })

  it('점유: 겹치면 다툼, 혼자면 땅 타일', () => {
    const g = newGame({ players: players(4), seed: 1 })
    start(g, 0)
    claimAll(g, ['river', 'river', 'harbor', 'bamboo'], 0)
    expect(g.phase).toBe('claimResult')
    expect(g.claimReveal!.feuds).toEqual(['river'])
    const v = view(g, 0, 0)
    const cell = (id: string) => v.board.find((b) => b.id === id)!.cells[0]!.tile
    expect(cell('river')).toBeNull()
    expect(cell('harbor')).toBe('yellow')
    expect(cell('bamboo')).toBe('green')
    expect(() => claim(g, 0, 'salt', 0)).toThrow(RuleError)
  })

  it('망각: 엔진에서도 진실이 지워지고 보기에도 나오지 않는다', () => {
    const g = newGame({ players: players(4), seed: 2 })
    let seen: { s: number; col: (number | null)[] } | null = null
    start(g, 0)
    claimAll(g, ['river', 'harbor', 'salt', 'hill'], 0)
    tick(g, 10_000) // 1계절 결과 → 2계절 점유
    expect(g.phase).toBe('claim')
    expect(view(g, 0, 10_000).board[0]!.cells[0]!.tile, '점유 중에는 직전 열이 보인다').toBe('red')
    claimAll(g, ['river', 'harbor', 'salt', 'hill'], 10_000)
    tick(g, 20_000, (s, col) => {
      seen = { s, col }
    }) // 2계절 결과 → 1계절 망각 → 회의
    expect(seen!.s).toBe(1)
    expect(g.forgotten).toBe(1)
    expect(g.truth.every((row) => row[1] === -1), '엔진의 진실도 지워짐').toBe(true)
    const v = view(g, 0, 20_000)
    expect(v.board.every((b) => b.cells[0]!.tile === null && b.cells[0]!.forgotten)).toBe(true)
    expect(JSON.stringify(v).includes('"tile":"red"'), '이번 계절 열은 보인다').toBe(true)
    expect(g.phase).toBe('choose')
  })

  it('질문 칸 선언 전에는 말할 수 없다', () => {
    const g = newGame({ players: players(4), seed: 3 })
    start(g, 0)
    for (let k = 0; k < 2; k++) {
      claimAll(g, ['river', 'harbor', 'salt', 'hill'], 0)
      tick(g, 1e9 * (k + 1))
    }
    expect(g.phase).toBe('choose')
    expect(() => say(g, 0, '강가 물어 줘', 0)).toThrow(RuleError)
  })

  it('자기 집안 색 증언은 낼 수 없다', () => {
    const g = newGame({ players: players(4), seed: 4 })
    expect(allowedTokens(g, 0)).not.toContain('red')
    expect(allowedTokens(g, 0)).toContain(GREY)
    expect(allowedTokens(g, 0)).toContain(EMPTY)
  })

  it('집계: 룰북 6-4 예시', () => {
    expect(tally(['blue', 'blue', 'red', 'yellow', GREY], 0).official).toBe('blue')
    expect(tally([GREY, GREY, GREY, 'blue', 'blue'], 0).official).toBe(GREY)
    expect(tally(['blue', 'blue', 'yellow', 'yellow'], 0).official, '동점, 질문자(0)가 파랑').toBe('blue')
    expect(tally([GREY, 'blue', 'blue', 'yellow', 'yellow'], 0).official, '동점, 질문자 답이 동점 밖').toBeNull()
    expect(tally([EMPTY, 'blue', 'yellow', EMPTY], 0).official, '질문자 빈 주먹').toBeNull()
    expect(tally(['green', 'blue', 'yellow', GREY], 0).official, '전원 다른 답').toBe('green')
    expect(tally([EMPTY, EMPTY, EMPTY, EMPTY], 0).official, '유효 증언 없음').toBeNull()
  })

  it('득점: 주인 구역 값 + 일치한 증언자 평판', () => {
    const g = newGame({ players: players(4), seed: 5 })
    start(g, 0)
    for (let k = 0; k < 2; k++) {
      claimAll(g, ['river', 'harbor', 'salt', 'hill'], 0)
      tick(g, 1e9 * (k + 1))
    }
    const pi = g.drawn!.find((d) => askableSeasons(g, d).length)!
    ask(g, g.questioner, g.plots[pi]!.id, 1, 0)
    fist(g, 0, EMPTY, 0)
    ;[1, 2, 3].forEach((i) => fist(g, i, 'red', 0))
    expect(g.phase).toBe('result')
    expect(g.result!.official).toBe('red')
    expect(g.players[0]!.score).toBe(g.plots[pi]!.value)
    ;[1, 2, 3].forEach((i) => expect(g.players[i]!.score).toBe(1))
  })

  for (const n of [4, 5, 6]) {
    it(`봇 ${n}인 한 판이 끝까지 진행된다`, () => {
      for (let seed = 1; seed <= 20; seed++) {
        const { g, questions } = playOut(n, seed * 97)
        expect(g.phase).toBe('ended')
        expect(questions).toBe(({ 4: 16, 5: 15, 6: 12 } as Record<number, number>)[n])
        expect(g.forgotten).toBe(7)
        expect(g.truth.every((row) => row.every((t) => t === -1)), '끝나면 진실은 하나도 남지 않는다').toBe(true)
      }
    })
  }
})
