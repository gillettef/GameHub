// 봇: 자기 좌석의 화면 정보(viewFor)만 보고 행동을 고른다. 숨은 정보를 훔쳐보지 않는다.
import { isRendezvous, RENDEZVOUS, type Crest, type Seat } from './board.ts'
import { legalMoves, accusableIds, isCovered, type Action, type PieceView, type View } from './rules.ts'

const TOTAL_AGENTS = 3

/** 왼쪽 플레이어(사냥 대상) 첩자일 확률 추정 */
export function targetProbs(v: View): Map<number, number> {
  const me = v.players[v.me!]!
  const tgt = me.target
  const tgtIdx = v.players.findIndex((p) => p.seat === tgt)
  const known = new Map<number, Crest>()
  for (const p of v.pieces) if (p.crest) known.set(p.id, p.crest)
  for (const [id, c] of Object.entries(v.seen)) if (!known.has(+id)) known.set(+id, c)
  const present = v.pieces.filter((p) => p.present)
  const unknown = present.filter((p) => !known.has(p.id))
  const revealedTgt = v.pieces.filter((p) => known.get(p.id) === tgt).length
  const remaining = Math.max(0, TOTAL_AGENTS - revealedTgt)
  const prior = unknown.length ? Math.min(0.95, remaining / unknown.length) : 0
  const probs = new Map<number, number>()
  for (const p of present) {
    if (known.has(p.id)) {
      probs.set(p.id, known.get(p.id) === tgt ? 1 : 0)
      continue
    }
    if (prior <= 0) {
      probs.set(p.id, 0)
      continue
    }
    let odds = prior / Math.max(1e-6, 1 - prior)
    const byTgt = p.moves[tgt] || 0
    const byOthers = Object.entries(p.moves).reduce((s, [k, c]) => s + (k === tgt ? 0 : c), 0)
    odds *= Math.pow(2.0, Math.min(byTgt, 4))
    odds *= Math.pow(0.85, Math.min(byOthers, 4))
    if (p.token === tgtIdx) odds *= 3.5
    probs.set(p.id, odds / (1 + odds))
  }
  return probs
}

type Spot = Pick<PieceView, 'id' | 'x' | 'y' | 'present'>

function distToRdv(pieces: readonly Spot[], p: Spot): number {
  let best = 9
  for (const [rx, ry] of RENDEZVOUS) {
    const occ = pieces.find((q) => q.present && q.id !== p.id && q.x === rx && q.y === ry)
    if (occ) continue
    const d = Math.abs(rx - p.x) + Math.abs(ry - p.y)
    best = Math.min(best, d)
  }
  return best
}

interface Ctx {
  mySeat: Seat
  hunterSeat: Seat
  hunterHasCard: boolean
  myAgents: Set<number>
  iHaveCard: boolean
}

function evaluate(v: View, pieces: readonly PieceView[], probs: Map<number, number>, ctx: Ctx): number {
  const { mySeat, hunterSeat, hunterHasCard, myAgents, iHaveCard } = ctx
  let s = 0
  for (const p of pieces) {
    if (!p.present) continue
    if (myAgents.has(p.id)) {
      const facesHunter = p.facing === hunterSeat || v.emptySeats.includes(p.facing)
      const onR = isRendezvous(p.x, p.y)
      s -= 0.7 * distToRdv(pieces, p)
      if (onR) s += facesHunter && hunterHasCard ? 1 : 5
      if (facesHunter && hunterHasCard) s -= 3.2
      if (!isCovered(pieces, p) && p.facing !== mySeat && !v.emptySeats.includes(p.facing)) s -= 0.4
    } else {
      const pr = probs.get(p.id) ?? 0
      if (iHaveCard && p.facing === mySeat) s += 2.2 * pr
      if (isRendezvous(p.x, p.y) && pr > 0.3) s -= 1.2 * pr
    }
  }
  return s
}

/** 봇 행동 선택. v = viewFor(state, i), rng 는 이동 평가의 작은 흔들림에 쓴다 */
export function chooseAction(v: View, rng: () => number): Action {
  const i = v.me!
  const me = v.players[i]!
  const mySeat = me.seat
  const n = v.n
  const hunter = v.players[(i - 1 + n) % n]!
  const probs = targetProbs(v)
  const pieces = v.pieces

  if (v.phase === 'scout') {
    if (!me.card) return { type: 'scoutAccuse', pieceId: null }
    const cands = pieces.filter((p) => p.present && p.facing === v.scout!.seat)
    let best: PieceView | null = null,
      bp = 0
    for (const p of cands) {
      const pr = probs.get(p.id) ?? 0
      if (pr > bp) {
        bp = pr
        best = p
      }
    }
    return { type: 'scoutAccuse', pieceId: best && bp >= 0.62 ? best.id : null }
  }

  // 1. 접선
  const myAgents = new Set(v.roster!.agents)
  const contactable = pieces.find((p) => p.present && myAgents.has(p.id) && isRendezvous(p.x, p.y))
  if (contactable) return { type: 'contact', pieceId: contactable.id }

  // 2. 내 좌석에서 지목
  if (me.card) {
    const acc = accusableIds(pieces, mySeat, mySeat, v.emptySeats)
    let best: number | null = null,
      bp = 0
    for (const id of acc) {
      const p = pieces[id - 1]!
      let pr = probs.get(id) ?? 0
      if (isRendezvous(p.x, p.y)) pr += 0.05
      if (pr > bp) {
        bp = pr
        best = id
      }
    }
    if (best && bp >= 0.72) return { type: 'accuse', pieceId: best }
  }

  // 3. 정찰: 사냥 대상의 초대장이 올려진 수상한 말이 다른 좌석을 향할 때
  if (me.glass > 0 && me.card) {
    const tgtIdx = v.players.findIndex((p) => p.seat === me.target)
    const threat = pieces.find(
      (p) => p.present && p.token === tgtIdx && p.facing !== mySeat && v.players.some((q, k) => k !== i && q.seat === p.facing) && (probs.get(p.id) ?? 0) >= 0.45,
    )
    if (threat) return { type: 'scout', seat: threat.facing }
  }

  // 4. 이동 평가
  const moves = legalMoves(pieces, mySeat, v.emptySeats)
  if (!moves.length) {
    if (me.card) {
      const acc = accusableIds(pieces, mySeat, mySeat, v.emptySeats)
      if (acc.length) return { type: 'accuse', pieceId: acc[0]! }
    }
    if (me.glass > 0) {
      const other = v.players.find((_q, k) => k !== i)!
      return { type: 'scout', seat: other.seat }
    }
    return { type: 'pass' }
  }
  const ctx: Ctx = { mySeat, hunterSeat: hunter.seat, hunterHasCard: hunter.card, myAgents, iHaveCard: me.card }
  const base = evaluate(v, pieces, probs, ctx)
  let best = moves[0]!,
    bs = -Infinity
  for (const m of moves) {
    const after = pieces.map((p) => (p.id === m.pieceId ? { ...p, x: m.x, y: m.y, facing: m.dir } : p))
    let s = evaluate(v, after, probs, ctx) - base
    if (myAgents.has(m.pieceId)) s += 0.15 // 템포
    s += rng() * 0.9
    if (s > bs) {
      bs = s
      best = m
    }
  }
  return { type: 'move', pieceId: best.pieceId, dir: best.dir, steps: best.steps }
}
