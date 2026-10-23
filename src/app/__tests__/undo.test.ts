import { describe, expect, it } from 'vitest'
import { applyAction, createGame, getLegalActions, type Action, type GameState } from '../../engine'
import { chooseBotAction } from '../../bot/bot'
import { canUndo } from '../session'

/** 개인 목표를 모두 고르고 1라운드 첫 차례까지 진행 */
function started(law?: 'shakyMarket'): GameState {
  let s = createGame({ playerCount: 2, seed: 7, ...(law ? { law } : {}) })
  while (s.phase.kind === 'setup') {
    const p = s.players.find((x) => x.personalGoal === null)?.id ?? 0
    s = applyAction(s, chooseBotAction(s, p) as Action)
  }
  return s
}

describe('되돌리기 판정 (canUndo)', () => {
  it('시장 칸 가져오기는 되돌릴 수 있다 (굴림 없음, 같은 차례)', () => {
    const before = started()
    const take = getLegalActions(before).find((a) => a.type === 'takeSlot') as Action
    const after = applyAction(before, take)
    expect(canUndo(before, after, take)).toBe(true)
  })

  it('차례를 끝내는 놓기는 되돌릴 수 없다', () => {
    let s = started()
    s = applyAction(s, getLegalActions(s).find((a) => a.type === 'takeSlot') as Action)
    // 1라운드는 한 턴에 1개: 놓으면 차례가 넘어간다
    const place = getLegalActions(s).find((a) => a.type === 'place') as Action
    const after = applyAction(s, place)
    expect(after.currentPlayer).not.toBe(s.currentPlayer)
    expect(canUndo(s, after, place)).toBe(false)
  })

  it('주사위를 다시 굴린 결과는 되돌릴 수 없다 (흔들리는 시장)', () => {
    const before = started('shakyMarket')
    const reroll = getLegalActions(before).find((a) => a.type === 'reroll') as Action
    expect(reroll).toBeDefined()
    const after = applyAction(before, reroll)
    expect(canUndo(before, after, reroll)).toBe(false)
  })

  it('봇 대국의 모든 행동에서: 난수가 바뀐 행동은 결코 되돌릴 수 없다', () => {
    let s = started()
    for (let i = 0; i < 400 && s.phase.kind === 'round'; i++) {
      const a = chooseBotAction(s, s.currentPlayer) as Action
      const next = applyAction(s, a)
      if (next.rng.s !== s.rng.s) expect(canUndo(s, next, a)).toBe(false)
      if (a.type === 'roll' || a.type === 'scrap' || a.type === 'reroll') expect(canUndo(s, next, a)).toBe(false)
      s = next
    }
  })
})
