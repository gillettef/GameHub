// CREASE 휴리스틱 봇: 남은 차례의 모든 걸음/접기 조합을 펼쳐 보고 평가 함수가 가장 높은 것을 고른다.
import {
  applyFoldAction,
  distTable,
  foldActions,
  isCoveredCol,
  key,
  neighbors,
  unkey,
  type Fold,
  type Player,
  type State,
  type TurnAction,
} from './engine.ts'

export interface BotProfile {
  selfW: number
  oppW: number
  absentPenalty: number
  noise: number
  allowFold: boolean
}

export const BOT_PROFILES = {
  /** 균형형: 자기 이득과 상대 견제를 함께 본다 */
  balanced: { selfW: 1.0, oppW: 0.6, absentPenalty: 2.0, noise: 0.3, allowFold: true },
  /** 독주형: 상대를 보지 않는다 */
  greedy: { selfW: 1.0, oppW: 0.0, absentPenalty: 2.0, noise: 0.3, allowFold: true },
  /** 방해형: 상대 견제를 크게 본다 */
  spiteful: { selfW: 1.0, oppW: 1.2, absentPenalty: 2.0, noise: 0.3, allowFold: true },
  /** 접기를 쓰지 않는 기준선 (접기의 가치 측정용) */
  nofold: { selfW: 1.0, oppW: 0.6, absentPenalty: 2.0, noise: 0.3, allowFold: false },
} satisfies Record<string, BotProfile>

export type ProfileName = keyof typeof BOT_PROFILES

export const isProfileName = (v: unknown): v is ProfileName => typeof v === 'string' && Object.hasOwn(BOT_PROFILES, v)

function potential(state: State, fold: Fold, pl: Player, shards: readonly number[], absentPenalty: number): number {
  const cfg = state.config
  let f = fold
  let pen = 0
  if (isCoveredCol(fold, pl.c)) {
    // 부재 중이면 다음 차례에 자기를 가린 쪽을 펼쳐야 한다
    const leftCovers = fold.L > 0 && pl.c >= fold.L && pl.c <= 2 * fold.L - 1
    f = leftCovers ? { L: 0, R: fold.R } : { L: fold.L, R: 0 }
    pen = absentPenalty
  }
  const D = distTable(f)
  const here = key(pl.c, pl.r)
  const row = D[here]!
  const dHome = row[pl.anchor]!
  let dShard = Infinity
  if (pl.carried < cfg.carryLimit) {
    shards.forEach((n, k) => {
      if (n <= 0 || isCoveredCol(f, unkey(k)[0])) return
      const d = row[k]!
      if (d < 0) return
      const total = d + 0.5 * D[k]![pl.anchor]!
      if (total < dShard) dShard = total
    })
  }
  let dNext: number
  if (pl.carried >= cfg.carryLimit) dNext = dHome
  else if (pl.carried === 0) dNext = dShard === Infinity ? 6 : dShard
  else dNext = Math.min(dHome, dShard)
  return 10 * pl.score + 7 * pl.carried - 1.1 * dNext - pen
}

interface Node {
  c: number
  r: number
  fold: Fold
  steps: number
  folded: boolean
  maxSteps: number
  carried: number
  score: number
  shards: number[]
  actions: TurnAction[]
}

/** 활성 플레이어의 남은 차례 행동 목록을 고른다(차례 중간이면 이미 쓴 걸음·접기를 뺀 나머지) */
export function chooseTurn(state: State, profile: ProfileName | BotProfile = 'balanced', rnd: () => number = mulberryFallback()): TurnAction[] {
  const prof = typeof profile === 'string' ? BOT_PROFILES[profile] : profile
  const cfg = state.config
  const me = state.players[state.current]!
  const others = state.players.filter((p) => p.id !== me.id)
  let best: TurnAction[] | null = null
  let bestVal = -Infinity
  const seen = new Set<string>()
  const startAbsent = state.turnStartAbsent

  function resolve(node: Node): Node {
    // 보이는 칸에 있을 때만 줍기·득점
    if (isCoveredCol(node.fold, node.c)) return node
    const k = key(node.c, node.r)
    let { carried, score, shards } = node
    const here = shards[k]!
    const cap = cfg.carryLimit - carried
    if (here > 0 && cap > 0) {
      const take = Math.min(here, cap)
      shards = shards.slice()
      shards[k] = here - take
      carried += take
    }
    if (k === me.anchor && carried > 0) {
      score += carried
      carried = 0
    }
    return { ...node, carried, score, shards }
  }

  function evaluate(node: Node): number {
    const self = { ...me, c: node.c, r: node.r, carried: node.carried, score: node.score }
    let v = prof.selfW * potential(state, node.fold, self, node.shards, prof.absentPenalty)
    let oppBest = -Infinity
    for (const o of others) oppBest = Math.max(oppBest, potential(state, node.fold, o, node.shards, prof.absentPenalty))
    if (others.length) v -= prof.oppW * oppBest
    return v + rnd() * prof.noise
  }

  function dfs(node: Node): void {
    const sk = `${node.c},${node.r},${node.fold.L},${node.fold.R},${node.steps},${node.folded},${node.carried},${node.score},${node.maxSteps}`
    if (seen.has(sk)) return
    seen.add(sk)
    const v = evaluate(node)
    if (v > bestVal) {
      bestVal = v
      best = node.actions
    }
    if (node.steps < node.maxSteps && !isCoveredCol(node.fold, node.c)) {
      for (const [nc, nr] of neighbors(node.fold, node.c, node.r)) {
        dfs(resolve({ ...node, c: nc, r: nr, steps: node.steps + 1, actions: [...node.actions, { type: 'step', to: [nc, nr] }] }))
      }
    }
    if (!node.folded) {
      for (const a of foldActions(node.fold)) {
        if (!prof.allowFold && a.type === 'fold') continue
        const nf = applyFoldAction(node.fold, a)
        const freed = cfg.freedStepPenalty && startAbsent && !isCoveredCol(nf, node.c)
        const maxSteps = freed ? cfg.moveSteps - cfg.freedStepPenalty! : node.maxSteps
        if (node.steps > maxSteps) continue
        dfs(resolve({ ...node, fold: nf, folded: true, maxSteps, actions: [...node.actions, a] }))
      }
    }
  }

  dfs(
    resolve({
      c: me.c,
      r: me.r,
      fold: { ...state.fold },
      steps: state.turnSteps,
      folded: state.turnFolded,
      maxSteps: state.turnMaxSteps,
      carried: me.carried,
      score: me.score,
      shards: state.shards,
      actions: [],
    }),
  )
  return best ?? []
}

/** rnd 를 주지 않았을 때: 흔들림이 없는 고정값 */
function mulberryFallback(): () => number {
  return () => 0.5
}
