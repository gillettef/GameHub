import { describe, expect, it } from 'vitest'
import { DIRS, buildMap, hexDist, mapDist, ringSpots, shuffleTiles } from '../src/engine/board'
import { RING_MUST, ringBag } from '../src/engine/data'
import { createGame, moveCost, pushStep, type State } from '../src/engine/game'
import { TILES, ZONE_CELLS } from '../src/engine/tiles'

/** 칸 묶음이 그래프에서 이어져 있는가 */
function connected(nb: number[][], ids: number[]): boolean {
  if (ids.length === 0) return true
  const set = new Set(ids)
  const seen = new Set([ids[0] as number])
  const q = [ids[0] as number]
  while (q.length) for (const w of nb[q.pop() as number] as number[]) if (set.has(w) && !seen.has(w)) (seen.add(w), q.push(w))
  return seen.size === set.size
}

describe('육각 판 데이터', () => {
  it('19장(성 1·폐허 6·숲 11·야영지 1), 모든 면에 출구 6개와 칸이 있다', () => {
    expect(TILES.castle).toHaveLength(1)
    expect(TILES.ruin).toHaveLength(6)
    expect(TILES.forest).toHaveLength(11)
    expect(TILES.camp).toHaveLength(1)
    for (const pair of [...TILES.castle, ...TILES.ruin, ...TILES.forest, ...TILES.camp])
      for (const f of pair) {
        expect(f.ports).toHaveLength(6)
        for (const p of f.ports) expect(f.cells[p.cell]).toBeDefined()
        expect(f.cells.length).toBeGreaterThan(0)
      }
  })

  it('칸 타일 묶음은 칸이 가장 많은 판 조합도 채운다', () => {
    for (const ring of [1, 2, 3] as const)
      for (const seats of [3, 4, 5]) expect(RING_MUST[ring].length + ringBag(ring, seats).length).toBeGreaterThanOrEqual(ZONE_CELLS[ring][1])
  })

  it('고리 자리: 고리 n 은 6n 칸, 모두 거리 n', () => {
    for (const n of [1, 2]) {
      const s = ringSpots(n)
      expect(s).toHaveLength(6 * n)
      for (const [q, r] of s) expect(hexDist(q, r)).toBe(n)
      expect(new Set(s.map((x) => x.join(','))).size).toBe(6 * n)
    }
    expect(DIRS).toHaveLength(6)
  })
})

describe('무작위 배치 보드', () => {
  it('어떻게 놓아도 장마다 열린 구역 안이 이어진다(300판)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const map = buildMap(shuffleTiles({ seed }))
      const z = (pred: (r: number) => boolean) => map.cells.map((c, i) => (pred(c.ring) ? i : -1)).filter((i) => i >= 0)
      expect(connected(map.nb, z((r) => r === 1))).toBe(true)
      expect(connected(map.nb, z((r) => r <= 2))).toBe(true)
      expect(connected(map.nb, z(() => true))).toBe(true)
      // 최종전: 성 판(안쪽 + 옥좌)만으로도 이어진다
      expect(connected(map.nb, z((r) => r >= 3))).toBe(true)
      expect(map.cells[map.camp]?.ring).toBe(1)
      expect(map.cells[map.throne]?.ring).toBe(4)
    }
  })

  it('같은 시드는 같은 보드', () => {
    expect(buildMap(shuffleTiles({ seed: 42 }))).toEqual(buildMap(shuffleTiles({ seed: 42 })))
  })

  it('칸 타일: 고리마다 꼭 까는 타일이 있고 모든 칸이 채워진다', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const s = createGame(4, seed)
      for (const ring of [1, 2, 3] as const) {
        const kinds = s.board.filter((t) => t.ring === ring).map((t) => t.kind)
        expect(kinds).toContain('boss')
        if (ring === 2) expect(kinds).toContain('forge')
        // 빈 땅은 트롤이 나온 방랑 몬스터 칸 하나뿐
        expect(kinds.filter((k) => k === 'empty')).toHaveLength(ring === 1 ? 1 : 0)
      }
      // 방랑 몬스터는 시작부터 트롤로 나와 있다
      expect(s.monsters.some((m) => m.kind === 'troll')).toBe(true)
      expect(s.players.every((p) => p.pos === s.map.camp)).toBe(true)
    }
  })
})

describe('험한 길과 밀쳐내기', () => {
  const game = (): State => createGame(4, 7)

  it('험한 길로 옮기면 토큰 +1, 가죽옷이면 면제', () => {
    const s = game()
    const link = s.map.links.find(([a, b, r]) => r === 1 && s.board[a]?.kind !== 'forest' && s.board[b]?.kind !== 'forest')
    expect(link).toBeDefined()
    const [a, b] = link as [number, number, 0 | 1]
    const p = s.players[0] as State['players'][number]
    p.pos = a
    expect(moveCost(s, p, b)).toBe(2)
    p.armor = 'leather'
    expect(moveCost(s, p, b)).toBe(1)
  })

  it('밀려나는 칸은 마왕에게서 한 칸 더 멀다', () => {
    const s = game()
    const king = s.map.throne
    for (const at of s.map.nb[king] as number[]) {
      const to = pushStep(s, king, at)
      if (to !== null) expect(mapDist(s.map, king, to)).toBe(mapDist(s.map, king, at) + 1)
    }
  })
})
