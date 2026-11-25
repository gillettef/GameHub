// 옛 단위 테스트(prototype/test/engine.test.js, rulebook.test.js)를 옮긴 것.
// 구성물 문서와 카드 데이터 일치, 봇 대전 불변식, 룰북 v0.2 의 예시. 룰북 예시를 바꾸면 여기도 바꾼다.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BOT_STYLES, chooseAction, guessMotives } from '../src/engine/bots'
import {
  CARDS,
  FIGURES,
  applyAction,
  cascade,
  decisiveCause,
  finalScore,
  illegalReason,
  isUnresolved,
  legalActions,
  makeRng,
  newGame,
  stateAt,
} from '../src/engine/engine'
import type { Fact } from '../src/engine/types'

describe('카드 데이터', () => {
  it('components/components.md 표와 일치한다', () => {
    const md = readFileSync(new URL('../components/components.md', import.meta.url), 'utf8')
    const rows = md.split('\n').filter((l) => /^\| C\d\d /.test(l))
    expect(rows.length).toBe(60)
    for (const row of rows) {
      const [id, title, figure, cond, effect] = row
        .split('|')
        .slice(1, 6)
        .map((s) => s.trim())
      const c = CARDS.find((x) => x.id === id)
      expect(c, id).toBeTruthy()
      expect(c!.title, id).toBe(title)
      expect(c!.figure, id).toBe(figure)
      expect(c!.cond ? `${c!.cond.subject} = ${c!.cond.state}` : '—', id).toBe(cond)
      expect(`${c!.effect.subject} = ${c!.effect.state}`, id).toBe(effect)
    }
  })

  it('인물 대칭: 인물마다 사실 10개에 1장씩, 무조건 3장', () => {
    for (const f of FIGURES) {
      const mine = CARDS.filter((c) => c.figure === f)
      expect(mine.length).toBe(10)
      expect(new Set(mine.map((c) => `${c.effect.subject}=${c.effect.state}`)).size).toBe(10)
      expect(mine.filter((c) => !c.cond).length).toBe(3)
    }
  })
})

describe('봇 대전', () => {
  it('300판: 시간선은 늘 모순이 없고, 게임은 끝나며, 차례 수가 같다', () => {
    const styles = Object.values(BOT_STYLES)
    for (let seed = 1; seed <= 300; seed++) {
      const n = 3 + (seed % 3)
      let g = newGame({ names: Array.from({ length: n }, (_, i) => `P${i}`), seed })
      const rng = makeRng(seed * 31)
      let guard = 0
      while (!g.over) {
        expect(legalActions(g).length, `행동 없음 seed=${seed}`).toBeGreaterThan(0)
        g = applyAction(g, chooseAction(g, styles[(g.current + seed) % styles.length], rng))
        expect(cascade(g.timeline, g.endings).removed.length, `모순 남음 seed=${seed}`).toBe(0)
        expect(++guard).toBeLessThan(400)
      }
      expect(
        g.turns.every((t) => t === g.turns[0]),
        `차례 수 불일치 seed=${seed}`,
      ).toBe(true)
      const guesses = g.names.map((_, p) => guessMotives(g, p))
      const s = finalScore(g, guesses)
      expect(s.rows.length).toBe(n)
      expect(s.winners.length).toBeGreaterThanOrEqual(1)
    }
  }, 60_000)
})

describe('룰북 v0.2 예시', () => {
  const ID = Object.fromEntries(CARDS.map((c) => [c.title, c.id]))
  /** 룰북식 칸 번호(1부터)로 시간선을 만든다 */
  function tl(size: number, placed: Record<number, string>): (string | null)[] {
    const t = Array<string | null>(size).fill(null)
    for (const [slot, title] of Object.entries(placed)) {
      expect(ID[title], `카드 없음: ${title}`).toBeTruthy()
      t[Number(slot) - 1] = ID[title]!
    }
    return t
  }
  const E = (subject: string, state: string): Fact => ({ subject, state })
  const id = (title: string) => ID[title]!

  it('5.1 왼쪽 최근 사실 규칙', () => {
    const t = tl(12, { 1: '수면초 넣은 술', 4: '기상 나팔' })
    expect(stateAt(t, 0, '경비')).toBe('깨어 있음') // 칸 1
    for (const s of [1, 2, 3]) expect(stateAt(t, s, '경비')).toBe('잠듦') // 칸 2~4
    expect(stateAt(t, 4, '경비')).toBe('깨어 있음') // 칸 5
  })

  it('5.2 금지 배치 1: 조건이 거짓', () => {
    expect(illegalReason(tl(12, {}), id('열쇠 훔치기'), 1, [])).toBe('condition')
  })

  it('5.2 금지 배치 2: 결말과 다른 가장 오른쪽 결과', () => {
    const endings = [E('성', '불탐')]
    const t = tl(12, {})
    for (let s = 0; s < 12; s++) expect(illegalReason(t, id('보수 공사'), s, endings)).toBe('ending')
    const t2 = tl(12, { 8: '엎어진 촛대' })
    expect(illegalReason(t2, id('보수 공사'), 6, endings)).toBeNull() // 칸 7
    expect(illegalReason(t2, id('보수 공사'), 8, endings)).toBe('ending') // 칸 9
  })

  it('6.2 조건 모순 연쇄', () => {
    const endings = [E('성', '불탐'), E('왕', '중독'), E('금고', '빔')]
    const t = tl(12, { 2: '수면초 넣은 술', 4: '기상 나팔', 5: '열쇠 훔치기', 7: '보석 반출' })
    const r = cascade(t, endings)
    expect(r.removed.map((x) => [x.slot + 1, x.kind])).toEqual([
      [5, 'condition'],
      [7, 'condition'],
    ])
    expect(isUnresolved(r.timeline, E('금고', '빔'))).toBe(true) // 진행 중에는 모순이 아니고, 종료 시 미해결
  })

  it('6.2 결말 모순 연쇄', () => {
    const endings = [E('금고', '빔')]
    const before = tl(12, { 1: '수면초 넣은 술', 2: '열쇠 훔치기', 3: '지참금 입고', 6: '보석 반출' })
    expect(cascade(before, endings).removed.length).toBe(0) // 놓기 전에는 모순 없음
    expect(illegalReason(before, id('장난삼아 잠금'), 4, endings)).toBeNull()
    const t = [...before]
    t[4] = id('장난삼아 잠금')
    const r = cascade(t, endings)
    expect(r.removed.map((x) => [x.slot + 1, x.kind])).toEqual([
      [6, 'condition'],
      [3, 'ending'],
    ])
  })

  it('7.1 결정 원인: 조건 있는 카드 중 가장 오른쪽', () => {
    const ending = E('성', '불탐')
    const t = tl(12, { 7: '엎어진 촛대', 10: '분노의 횃불', 12: '불꽃놀이' })
    expect(decisiveCause(t, ending)!.slot + 1).toBe(12)
    // 불꽃놀이가 버려지면 분노의 횃불이 이어받는다
    const t2 = [...t]
    t2[11] = null
    expect(decisiveCause(t2, ending)!.slot + 1).toBe(10)
    // 조건 없는 카드만 있으면 결정 원인이 없다
    expect(decisiveCause(tl(12, { 7: '엎어진 촛대' }), ending)).toBeNull()
  })

  it('9 FAQ 연쇄 탈취', () => {
    const endings = [E('성', '멀쩡')]
    const t = tl(12, { 5: '엎어진 촛대', 9: '소화 지휘', 12: '보수 공사' })
    expect(decisiveCause(t, endings[0]!)!.cardId).toBe(id('소화 지휘'))
    expect(illegalReason(t, id('물동이 행렬'), 6, endings)).toBeNull()
    const t2 = [...t]
    t2[6] = id('물동이 행렬')
    const r = cascade(t2, endings)
    expect(r.removed.map((x) => x.cardId)).toEqual([id('소화 지휘')])
    expect(decisiveCause(r.timeline, endings[0]!)!.cardId).toBe(id('물동이 행렬'))
  })

  it('8.2 시작 상태와 같은 결말은 결과가 없어도 미해결이 아니다', () => {
    expect(isUnresolved(tl(12, {}), E('왕', '건강'))).toBe(false)
    expect(isUnresolved(tl(12, {}), E('왕', '중독'))).toBe(true)
  })

  it('8.3 득점 예시: 하인 6점', () => {
    const endings = [E('성', '불탐'), E('왕', '건강'), E('금고', '빔')]
    const g = newGame({ names: ['나', 'B', 'C'], seed: 1, endings, motives: ['하인', '왕비', '대신'] })
    // 하인 카드 3장(결정 원인 포함): 수면초(경비 잠듦) → 몰래 빼돌리기(금고 빔, 조건) + 엎어진 촛대
    g.timeline = tl(9, { 1: '수면초 넣은 술', 3: '몰래 빼돌리기', 5: '엎어진 촛대' })
    g.paradox[0] = 1
    const s = finalScore(g, [{ 1: '왕비', 2: '대신' }, {}, {}])
    // 결정 원인: 금고=빔 → 몰래 빼돌리기(하인). 성=불탐 → 조건 있는 카드 없음
    expect(s.rows[0]!.decisive).toBe(1)
    expect(s.rows[0]!.cards).toBe(3)
    expect(s.rows[0]!.correct).toBe(2)
    expect(s.rows[0]!.total).toBe(6)
  })

  it('8.1 종료 라운드: 모두 같은 횟수의 차례', () => {
    let g = newGame({ names: ['A', 'B', 'C', 'D'], seed: 7 })
    // 덱을 거의 비워 2번 자리 차례에 종료가 시작되게 한다
    g.deck = g.deck.slice(0, 2)
    g = applyAction(g, { type: 'exchange', cardId: g.hands[0]![0]! })
    g = applyAction(g, { type: 'exchange', cardId: g.hands[1]![0]! })
    expect(g.finalRound).toBe(true)
    expect(g.over).toBe(false)
    g = applyAction(g, { type: 'pass' })
    g = applyAction(g, { type: 'pass' })
    expect(g.over).toBe(true)
    expect(g.turns).toEqual([1, 1, 1, 1])
  })
})
