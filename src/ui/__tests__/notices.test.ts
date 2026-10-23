import { describe, expect, it } from 'vitest'
import { applyAction, createGame, type GameState } from '../../engine'
import { chooseBotAction } from '../../bot/bot'
import { diffEvents, type FxEvent } from '../fx'
import { buildNotices, type Notice } from '../notices'

/** 봇끼리 끝까지 두며 행동마다 알림을 모은다 */
function playAll(seed: number): Notice[] {
  let state: GameState = createGame({ playerCount: 3, seed })
  const out: Notice[] = []
  for (let i = 0; i < 2000 && state.phase.kind !== 'ended'; i++) {
    const p = state.phase.kind === 'setup' ? state.players.find((pl) => pl.personalGoal === null)?.id : state.currentPlayer
    const action = p === undefined ? null : chooseBotAction(state, p)
    if (!action) break
    const next = applyAction(state, action)
    out.push(...buildNotices(diffEvents(state, next), next))
    state = next
  }
  return out
}

describe('buildNotices', () => {
  it('직전 라운드 결과(평면·목표·잔해)를 먼저, 새 라운드 안내를 마지막에 둔다', () => {
    const state = createGame({ playerCount: 2, seed: 1 })
    const events: FxEvent[] = [
      { kind: 'round', round: 3 },
      { kind: 'goal', player: 0, name: '거울', points: 4, first: true },
      { kind: 'debris', player: 1, count: 1 },
      { kind: 'plane', player: 0, points: 7 },
      { kind: 'plane', player: 1, points: 5 },
    ]
    expect(buildNotices(events, state).map((n) => n.kind)).toEqual(['plane', 'goal', 'debris', 'round'])
  })

  it('차례 넘김만 있으면 알림이 없다', () => {
    expect(buildNotices([{ kind: 'turn', player: 1 }], createGame({ playerCount: 2, seed: 1 }))).toEqual([])
  })

  it('스스로 버린 잔해는 알리지 않는다', () => {
    const state = createGame({ playerCount: 2, seed: 1 })
    const events: FxEvent[] = [
      { kind: 'debris', player: 0, count: 1 },
      { kind: 'debris', player: 1, count: 2 },
    ]
    expect(buildNotices(events, state, (p) => p === 0)).toEqual([{ kind: 'debris', items: [{ player: 1, count: 2 }] }])
  })

  it('한 게임 동안 1~4라운드 안내가 차례로 한 번씩 나온다', () => {
    const notices = playAll(7)
    const rounds = notices.flatMap((n) => (n.kind === 'round' ? [n] : []))
    expect(rounds.map((n) => n.round)).toEqual([1, 2, 3, 4])
    expect(rounds[0]?.startPlayer).not.toBeNull()
    expect(rounds[3]?.pending).toHaveLength(3)
    expect(notices.some((n) => n.kind === 'plane' && n.items.length === 3)).toBe(true)
  })
})
