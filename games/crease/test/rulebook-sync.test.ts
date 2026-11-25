// 룰북 3장 표의 수치가 엔진 확정 수치(src/engine/rules.ts 의 RULES)와 같은지 검사한다
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { cellName } from '../src/engine/engine'
import { RULES, per } from '../src/engine/rules'

const book = readFileSync(new URL('../rules/rulebook.md', import.meta.url), 'utf8')

it('룰북 준비 표의 목표 점수와 닻 칸이 엔진과 같다', () => {
  for (const n of [2, 3, 4]) {
    const row = book.split('\n').find((l) => l.startsWith(`| ${n}인 |`))
    expect(row, `${n}인 행이 없다`).toBeDefined()
    const cells = row!.split('|').map((x) => x.trim()).filter(Boolean)
    expect(Number(cells[1]), `${n}인 목표 점수`).toBe(per(RULES.target, n))
    expect(cells.slice(2, 2 + n), `${n}인 닻 칸`).toEqual(per(RULES.anchors, n).map(([c, r]) => cellName(c, r)))
  }
})

it('룰북의 걸음 수·들 수 있는 조각·초기 조각 수가 엔진과 같다', () => {
  expect(book).toContain(`최대 ${RULES.moveSteps}**걸음**`)
  expect(book).toContain(`최대 ${RULES.carryLimit}개까지 들고`)
  for (const n of [2, 3, 4]) expect(per(RULES.initialShards, n)).toBe(6)
  expect(book).toContain('별똥별 카드를 6장 뒤집는다')
  expect(RULES.spawnPerTurn).toBe(1)
  expect(RULES.endMode).toBe('round')
})
