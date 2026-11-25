// LIGHTCONE 봇. publicView 로 얻는 공개 정보와 자기 정보만 쓴다(상대 실체를 훔쳐보지 않는다).
// 난수는 부르는 쪽이 rng 로 준다(같은 rng 수열이면 같은 수를 둔다).
import { FLEET_IDS, HOME, PLANETS, STRENGTH, SYSTEMS, dist, type Pid } from './map.ts'
import {
  STAY,
  canOccupy,
  eligibleFleets,
  legalMoves,
  other,
  realPos,
  ripple,
  type BlockadeOption,
  type OccupyOrder,
  type PublicView,
  type State,
} from './engine.ts'

export type Rng = () => number

const CENTER = ['8', '9', '10']

function myPendingPlanets(view: PublicView): Set<string> {
  const set = new Set<string>()
  for (let k = 1; k <= 5; k++) for (const c of view.my.slots[k]!) if (c.kind === 'planet') set.add(c.planet)
  return set
}

interface Known {
  at: string
  age: number
}

// 상대 함대별로 "가장 최근에 확실히 알던 위치와 그때부터 지난 라운드 수"를 구한다.
function lastKnown(view: PublicView): Record<number, Known> {
  const opp = other(view.me)
  const known: Record<number, Known> = {}
  for (const e of view.oppEchoes) known[e.id] = { at: e.echo, age: 2 }
  for (const e of view.log) {
    const age = view.round - e.round
    if (e.type === 'strike' && e.pid === opp && age < (known[e.fid]?.age ?? 99)) {
      known[e.fid] = { at: e.system, age }
    }
    if (e.type === 'engagement') {
      for (const fid of e.fleets[opp]) {
        if (age < (known[fid]?.age ?? 99)) known[fid] = { at: e.system, age }
      }
    }
    if (e.type === 'recall' && e.pid === opp && age < (known[e.fid]?.age ?? 99)) {
      known[e.fid] = { at: HOME[opp], age }
    }
  }
  return known
}

// 상대 함대가 지금 각 성계에 있을 확률(대략)을 더한 값
function threatMap(view: PublicView) {
  const opp = other(view.me)
  const known = lastKnown(view)
  const threat: Record<string, number> = Object.fromEntries(SYSTEMS.map((s) => [s, 0]))
  const strength: Record<string, number> = Object.fromEntries(SYSTEMS.map((s) => [s, 0]))
  for (const fid of FLEET_IDS) {
    const k = known[fid]!
    const radius = Math.max(0, Math.min(3, k.age))
    const cands = SYSTEMS.filter((s) => dist(k.at, s) <= radius)
    const w = (s: string) => {
      let x = 1
      if (PLANETS.includes(s)) x += view.holds[s] === opp ? 1 : 2.5
      if (CENTER.includes(s)) x += 1
      if (s === HOME[opp]) x *= 0.4
      return x
    }
    const total = cands.reduce((t, s) => t + w(s), 0)
    for (const s of cands) {
      threat[s] = threat[s]! + w(s) / total
      strength[s] = strength[s]! + (w(s) / total) * STRENGTH[fid]!
    }
  }
  return { threat, strength }
}

function planetValue(view: PublicView, s: string, pending: Set<string>): number {
  const me = view.me
  const opp = other(me)
  let v = 0
  if (view.holds[s] !== me && !pending.has(s)) v = 10
  else if (view.holds[s] === me) v = 1.5
  if (view.holds[s] === opp) v += 2
  if (CENTER.includes(s)) v += 2
  // 늦게 놓을수록 마지막 빛 전에 도달하지 못한다
  const arriveBy = view.round + 1 + ripple({ nebula: view.nebula }, s)
  if (arriveBy > 13) v -= 6
  return v
}

// 상대의 파문이 곧 도달할 수 있는 내 행성(봉쇄 후보)
function blockadeTargets(view: PublicView): string[] {
  const me = view.me
  const out: string[] = []
  for (const s of PLANETS) {
    if (view.holds[s] !== me) continue
    const d = ripple({ nebula: view.nebula }, s)
    const incoming = view.oppSlotCounts.slice(1, 3).some((n, i) => (n ?? 0) > 0 && d >= i + 1)
    if (incoming) out.push(s)
  }
  return out
}

export function botMoves(view: PublicView, rng: Rng): string[] {
  const pending = myPendingPlanets(view)
  const { strength } = threatMap(view)
  const blockades = view.round >= 5 ? blockadeTargets(view) : []
  const taken = new Set<string>()
  const order = [...FLEET_IDS].sort((a, b) => STRENGTH[b]! - STRENGTH[a]!)
  const plan: Record<number, string> = {}
  const me: Pid = view.me
  for (const fid of order) {
    const f = view.my.fleets.find((x) => x.id === fid)!
    const here = realPos(f)
    let best: { s: string; score: number } | null = null
    for (const s of PLANETS) {
      if (taken.has(s)) continue
      let score = planetValue(view, s, pending)
      if (blockades.includes(s)) score += 6
      const d = dist(here, s)
      score -= 2.2 * d
      if (strength[s]! > STRENGTH[fid]!) score -= 2.5 * (strength[s]! - STRENGTH[fid]!)
      score += rng() * 1.5
      if (!best || score > best.score) best = { s, score }
    }
    const target = best?.s ?? here
    taken.add(target)
    const legal = legalMoves({ players: { [me]: view.my } }, me, fid)
    let move = STAY
    if (target !== here) {
      const steps = legal.filter((m) => m !== STAY)
      const better = steps.filter((m) => dist(m, target) < dist(here, target))
      const pool = better.length ? better : steps.filter((m) => dist(m, target) <= dist(here, target))
      if (pool.length) move = pool[Math.floor(rng() * pool.length)]!
    }
    plan[fid] = move
  }
  return FLEET_IDS.map((fid) => plan[fid]!)
}

export function botAttacks(view: PublicView, rng: Rng): number[] {
  const { threat, strength } = threatMap(view)
  const pending = myPendingPlanets(view)
  const out: number[] = []
  for (const f of view.my.fleets) {
    const s = realPos(f)
    if (s === HOME[view.me]) continue
    const p = Math.min(1, threat[s]!)
    const myStr = view.my.fleets.filter((x) => realPos(x) === s).reduce((t, x) => t + STRENGTH[x.id]!, 0)
    const wantsOccupy = PLANETS.includes(s) && view.holds[s] !== view.me && !pending.has(s)
    const threshold = wantsOccupy ? 0.65 : 0.33
    if (p >= threshold && myStr >= strength[s]! * 0.9 && rng() < 0.85) out.push(f.id)
  }
  return out
}

/** 봉쇄는 늘 한다 */
export function botBlockades(options: readonly BlockadeOption[]): number[] {
  return options.map((o) => o.idx)
}

export function botOccupations(view: PublicView, state: State, rng: Rng): OccupyOrder[] {
  const pid = view.me
  const pending = myPendingPlanets(view)
  const orders: OccupyOrder[] = []
  const usedPlanets = new Set<string>()
  const eligible = eligibleFleets(state, pid)
  const idle: number[] = []
  for (const fid of eligible) {
    const f = view.my.fleets.find((x) => x.id === fid)!
    const s = realPos(f)
    const contested = view.holds[s] === other(pid)
    const worth = PLANETS.includes(s) && (view.holds[s] !== pid || rng() < 0.3) && (!pending.has(s) || contested)
    const arriveBy = view.round + ripple(state, s)
    if (worth && canOccupy(state, pid, fid) && !usedPlanets.has(s) && arriveBy <= 13) {
      orders.push({ fid, kind: 'occupy' })
      usedPlanets.add(s)
    } else idle.push(fid)
  }
  let decoys = view.my.decoys
  for (const fid of idle) {
    if (decoys > 0 && view.round <= 8 && rng() < 0.3) {
      orders.push({ fid, kind: 'decoy', slot: 3 + Math.floor(rng() * 3) })
      decoys -= 1
    }
  }
  return orders
}
