// 옛 prototype/test/engine.test.js 를 vitest 로 옮긴 것. 규칙 장면별 확인.
import { describe, expect, it } from 'vitest'
import { botAttacks, botBlockades, botMoves, botOccupations } from '../src/engine/bot'
import {
  STAY,
  blockadeOptions,
  fleetOf,
  holdCount,
  legalMoves,
  makeRng,
  newGame,
  publicView,
  realPos,
  submitAttacks,
  submitBlockades,
  submitMoves,
  submitOccupations,
  type State,
} from '../src/engine/engine'
import { ADJ, DIST, PLANETS, SYSTEMS, baseRipple, rippleDistance } from '../src/engine/map'

const stay3 = [STAY, STAY, STAY]
const goTo = (state: State, A: string[], B: string[]) => submitMoves(state, { A, B })

describe('엔진', () => {
  it('지도: 인접표가 대칭이고 성계 9 기준 점대칭이다', () => {
    const mirror = (s: string) => (s === 'A' ? 'B' : s === 'B' ? 'A' : String(18 - Number(s)))
    for (const s of SYSTEMS) {
      for (const t of ADJ[s]!) {
        expect(ADJ[t]!.includes(s), `${s}-${t}`).toBe(true)
        expect(ADJ[mirror(s)]!.includes(mirror(t)), `mirror ${s}-${t}`).toBe(true)
      }
    }
  })

  it('파문 거리: 룰북 표와 같고, 모든 행성의 두 모항성 거리 합은 6이다', () => {
    const expected: Record<string, number> = { 2: 5, 4: 4, 7: 4, 8: 3, 9: 3, 10: 3, 11: 4, 14: 4, 16: 5 }
    for (const p of PLANETS) {
      expect(baseRipple(p)).toBe(expected[p])
      expect(DIST.A![p]! + DIST.B![p]!).toBe(6)
    }
    expect(rippleDistance('9', ['9'])).toBe(4)
    for (const card of [['4', '14'], ['7', '11'], ['8', '10'], ['9']]) {
      for (const p of card) expect(rippleDistance(p, card), '성운이 놓여도 5번 칸을 넘지 않는다').toBeLessThanOrEqual(5)
    }
  })

  it('광선 컨베이어: 잔상은 2라운드 전 위치이고, 관성으로 직전 성계에 못 돌아간다', () => {
    const g = newGame({ seed: 1, nebula: ['9'] })
    goTo(g, ['2', STAY, STAY], stay3)
    submitAttacks(g, { A: [], B: [] })
    submitOccupations(g, { A: [], B: [] })
    expect(fleetOf(g, 'A', 1).echo).toBe('A')
    goTo(g, ['5', STAY, STAY], stay3)
    expect(realPos(fleetOf(g, 'A', 1))).toBe('5')
    expect(fleetOf(g, 'A', 1).echo, '2라운드: 잔상은 아직 모항성(1라운드 전 머무름)').toBe('A')
    submitAttacks(g, { A: [], B: [] })
    submitOccupations(g, { A: [], B: [] })
    expect(legalMoves(g, 'A', 1).includes('2'), '관성: 직전 성계 2 로 못 간다').toBe(false)
    expect(legalMoves(g, 'A', 1).includes('9')).toBe(true)
    goTo(g, ['9', STAY, STAY], stay3)
    expect(fleetOf(g, 'A', 1).echo, '3라운드에는 1라운드 위치(2)가 잔상').toBe('2')
  })

  it('교전: 동률이면 공격받은 쪽만 귀환, 쌍방 공격 동률이면 아무도 귀환하지 않는다', () => {
    const setup = () => {
      const g = newGame({ seed: 2, nebula: ['9'] })
      const pathA = [['2', '1', STAY], ['5', '4', STAY], ['9', '8', STAY]]
      const pathB = [['16', '15', STAY], ['13', '12', STAY], ['9', '8', STAY]]
      for (let i = 0; i < 3; i++) {
        goTo(g, pathA[i]!, pathB[i]!)
        if (i < 2) {
          submitAttacks(g, { A: [], B: [] })
          submitOccupations(g, { A: [], B: [] })
        }
      }
      return g // 3라운드 이동 후: 양쪽 함대 1 은 9, 함대 2 는 8
    }
    let g = setup()
    submitAttacks(g, { A: [1], B: [] })
    expect(fleetOf(g, 'B', 1).recalled).toBe(true)
    expect(realPos(fleetOf(g, 'B', 1))).toBe('B')
    expect(fleetOf(g, 'A', 1).recalled).toBe(false)

    g = setup()
    submitAttacks(g, { A: [1], B: [1] })
    expect(fleetOf(g, 'A', 1).recalled).toBe(false)
    expect(fleetOf(g, 'B', 1).recalled).toBe(false)
  })

  it('점령과 도달: 나중에 도달한 점령이 덮어쓰고, 같은 라운드 도달은 중립이다', () => {
    const g = newGame({ seed: 3, nebula: ['4', '14'] })
    const pathA = [['2', STAY, STAY], ['6', STAY, STAY], ['10', STAY, STAY]]
    const pathB = [['16', STAY, STAY], ['13', STAY, STAY], ['10', STAY, STAY]]
    for (let i = 0; i < 3; i++) {
      goTo(g, pathA[i]!, pathB[i]!)
      submitAttacks(g, { A: [], B: [] })
      const occ = i === 2 ? [{ fid: 1, kind: 'occupy' as const }] : []
      submitOccupations(g, { A: occ, B: i === 2 ? [{ fid: 1, kind: 'occupy' }] : [] })
    }
    expect(g.players.A.slots[3]!.length).toBe(1)
    for (let r = 4; r <= 6; r++) {
      goTo(g, stay3, stay3)
      submitAttacks(g, { A: [], B: [] })
      if (g.phase === 'blockade') submitBlockades(g, { A: [], B: [] })
      submitOccupations(g, { A: [], B: [] })
    }
    expect(g.holds['10'], '같은 라운드 도달 → 중립').toBeUndefined()
    expect(holdCount(g, 'A')).toBe(0)
  })

  it('봉쇄: 도달하는 행성에 상대 실체가 있으면 무효로 할 수 있다', () => {
    const g = newGame({ seed: 4, nebula: ['4', '14'] })
    const pathA = [['2', STAY, STAY], ['6', STAY, STAY], ['10', STAY, STAY]]
    const pathB = [['17', STAY, STAY], ['13', STAY, STAY], ['10', STAY, STAY]]
    for (let i = 0; i < 3; i++) {
      goTo(g, pathA[i]!, pathB[i]!)
      submitAttacks(g, { A: [], B: [] })
      submitOccupations(g, { A: i === 2 ? [{ fid: 1, kind: 'occupy' }] : [], B: [] })
    }
    for (let r = 4; r <= 6; r++) {
      goTo(g, [STAY, STAY, STAY], stay3)
      submitAttacks(g, { A: [], B: [] })
      if (r < 6) submitOccupations(g, { A: [], B: [] })
    }
    expect(g.phase).toBe('blockade')
    const opts = blockadeOptions(g)
    expect(opts.length).toBe(1)
    expect(opts[0]!.blocker).toBe('B')
    submitBlockades(g, { A: [], B: [opts[0]!.idx] })
    expect(g.holds['10']).toBeUndefined()
    expect(g.players.A.planetCards['10'], '봉쇄된 카드는 돌아온다').toBe(2)
  })

  it('점령 검증: 카드 수 상한과 공격한 함대의 점령 금지', () => {
    const g = newGame({ seed: 5, nebula: ['9'] })
    goTo(g, ['2', '1', '3'], stay3)
    submitAttacks(g, { A: [2], B: [] })
    expect(() => submitOccupations(g, { A: [{ fid: 2, kind: 'decoy', slot: 3 }], B: [] })).toThrow()
    submitOccupations(g, { A: [{ fid: 1, kind: 'occupy' }, { fid: 3, kind: 'decoy', slot: 4 }], B: [] })
    expect(g.players.A.slots[5]!.length).toBe(1)
    expect(g.players.A.slots[4]!.length).toBe(1)
  })

  it('봇 대 봇: 200판이 규칙 위반 없이 끝나고, 봇은 공개 정보만 받는다', () => {
    const rng = makeRng(42)
    for (let i = 0; i < 200; i++) {
      const g = newGame({ seed: 1000 + i })
      let guard = 0
      while (g.phase !== 'over') {
        if (++guard > 100) throw new Error('끝나지 않는다')
        if (g.phase === 'plan') {
          submitMoves(g, { A: botMoves(publicView(g, 'A'), rng), B: botMoves(publicView(g, 'B'), rng) })
        } else if (g.phase === 'attack') {
          submitAttacks(g, { A: botAttacks(publicView(g, 'A'), rng), B: botAttacks(publicView(g, 'B'), rng) })
        } else if (g.phase === 'blockade') {
          const opts = blockadeOptions(g)
          submitBlockades(g, {
            A: botBlockades(opts.filter((o) => o.blocker === 'A')),
            B: botBlockades(opts.filter((o) => o.blocker === 'B')),
          })
        } else if (g.phase === 'occupy') {
          submitOccupations(g, {
            A: botOccupations(publicView(g, 'A'), g, rng),
            B: botOccupations(publicView(g, 'B'), g, rng),
          })
        }
      }
      expect(['A', 'B', 'draw']).toContain(g.winner)
      const v = publicView(g, 'A')
      expect(v.log.filter((e) => e.type === 'place' && e.pid === 'B').every((e) => e.type === 'place' && e.secret === undefined)).toBe(true)
    }
  })
})
