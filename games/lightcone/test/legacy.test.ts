// 옛 엔진(prototype/src/*.js, 커밋 7183d82)과 같은 시드에서 새 엔진·봇이 같은 수를 두고 같은 상태가 되는지 확인한다.
// fixtures/legacy-traces.json 은 옛 엔진으로 판을 끝까지 두며 단계마다 두 사람이 낸 행동과
// 상태·두 좌석의 playerView 해시를 기록한 것이다. 봇 좌석은 같은 난수 수열로 새 봇이 다시 고르게 해 수까지 비교하고,
// 무작위 좌석은 옛 생성기와 같은 방식으로 다시 골라 기록과 같은지 본다.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { botAttacks, botBlockades, botMoves, botOccupations, type Rng } from '../src/engine/bot'
import {
  blockadeOptions,
  canOccupy,
  eligibleFleets,
  fleetOf,
  legalMoves,
  makeRng,
  newGame,
  playerView,
  publicView,
  realPos,
  submitAttacks,
  submitBlockades,
  submitMoves,
  submitOccupations,
  type OccupyOrder,
  type State,
} from '../src/engine/engine'
import { FLEET_IDS, type Pid } from '../src/engine/map'

type Kind = 'bot' | 'rand'
type Step = ['m' | 'a' | 'b' | 'o', [unknown, unknown], string]
interface Trace {
  variant: string
  seed: number
  nebula: string[] | null
  kinds: Record<Pid, Kind>
  start: string
  steps: Step[]
  winner: Pid | 'draw'
  lastLight: boolean
  final?: unknown
}

const traces = JSON.parse(readFileSync(new URL('./fixtures/legacy-traces.json', import.meta.url), 'utf8')) as Trace[]

function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon)
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {}
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k]
      if (x !== undefined) o[k] = canon(x)
    }
    return o
  }
  return v
}
const h = (x: unknown) => createHash('sha1').update(JSON.stringify(canon(x))).digest('hex').slice(0, 12)
const stateHash = (g: State) => h({ g, a: playerView(g, 'A'), b: playerView(g, 'B') })

// 옛 생성기의 무작위 합법 행동(같은 난수 소비 순서)
const randMoves = (g: State, pid: Pid, rng: Rng) =>
  FLEET_IDS.map((fid) => {
    const l = legalMoves(g, pid, fid)
    return l[Math.floor(rng() * l.length)]!
  })
const randAttacks = (rng: Rng) => FLEET_IDS.filter(() => rng() < 0.35)
const randBlocks = (opts: { idx: number }[], rng: Rng) => opts.filter(() => rng() < 0.6).map((o) => o.idx)
function randOcc(g: State, pid: Pid, rng: Rng): OccupyOrder[] {
  const orders: OccupyOrder[] = []
  const used = new Set<string>()
  let decoys = g.players[pid].decoys
  for (const fid of eligibleFleets(g, pid)) {
    const s = realPos(fleetOf(g, pid, fid))
    const r = rng()
    if (r < 0.55 && canOccupy(g, pid, fid) && !used.has(s)) {
      used.add(s)
      orders.push({ fid, kind: 'occupy' })
    } else if (r < 0.75 && decoys > 0) {
      decoys -= 1
      orders.push({ fid, kind: 'decoy', slot: 3 + Math.floor(rng() * 3) })
    }
  }
  return orders
}

describe('옛 엔진과 같은 진행', () => {
  it('기록이 충분하다', () => {
    expect(traces.length).toBeGreaterThanOrEqual(100)
    expect(new Set(traces.map((t) => t.variant)).size).toBeGreaterThanOrEqual(8)
    expect(traces.reduce((n, t) => n + t.steps.length, 0)).toBeGreaterThan(3000)
    expect(traces.some((t) => t.steps.some((s) => s[0] === 'b'))).toBe(true)
    expect(traces.some((t) => !t.lastLight)).toBe(true)
  })

  for (const t of traces) {
    it(`${t.variant} 시드 ${t.seed}`, () => {
      const g = newGame(t.nebula ? { seed: t.seed, nebula: t.nebula } : { seed: t.seed })
      const rng = makeRng(t.seed * 7919 + 13)
      expect(stateHash(g)).toBe(t.start)
      const choose = <T>(pid: Pid, bot: () => T, rand: () => T) => (t.kinds[pid] === 'bot' ? bot() : rand())
      t.steps.forEach(([kind, recorded, hash], i) => {
        expect(g.phase).toBe({ m: 'plan', a: 'attack', b: 'blockade', o: 'occupy' }[kind])
        let acts: Record<Pid, unknown>
        if (kind === 'm') {
          acts = { A: null, B: null }
          for (const pid of ['A', 'B'] as const) acts[pid] = choose(pid, () => botMoves(publicView(g, pid), rng), () => randMoves(g, pid, rng))
          submitMoves(g, acts as Record<Pid, string[]>)
        } else if (kind === 'a') {
          acts = { A: null, B: null }
          for (const pid of ['A', 'B'] as const) acts[pid] = choose(pid, () => botAttacks(publicView(g, pid), rng), () => randAttacks(rng))
          submitAttacks(g, acts as Record<Pid, number[]>)
        } else if (kind === 'b') {
          const opts = blockadeOptions(g)
          acts = { A: null, B: null }
          for (const pid of ['A', 'B'] as const) {
            const mine = opts.filter((o) => o.blocker === pid)
            acts[pid] = choose(pid, () => botBlockades(mine), () => randBlocks(mine, rng))
          }
          submitBlockades(g, acts as Record<Pid, number[]>)
        } else {
          acts = { A: null, B: null }
          for (const pid of ['A', 'B'] as const) acts[pid] = choose(pid, () => botOccupations(publicView(g, pid), g, rng), () => randOcc(g, pid, rng))
          submitOccupations(g, acts as Record<Pid, OccupyOrder[]>)
        }
        expect([i, kind, canon([acts.A, acts.B]), stateHash(g)]).toEqual([i, kind, canon(recorded), hash])
      })
      expect(g.phase).toBe('over')
      expect(g.winner).toBe(t.winner)
      expect(g.lastLight).toBe(t.lastLight)
      if (t.final) expect(canon(g)).toEqual(t.final)
    })
  }
})
