/**
 * 밸런스 시뮬레이터(docs/design.md 19절 지표). 봇끼리 많은 판을 둔다.
 *   npx tsx tools/sim.ts [판수=300]
 */
import { botAction, botFallback, type BotLevel } from '../src/engine/bot'
import { IllegalAction, actors, apply, createGame, type Ctx, type State } from '../src/engine/game'

interface Out {
  seats: number
  demonWin: boolean
  kingWasPublicTop: boolean
  lastHitUnderdog: boolean | null
  avgLevel: number
  kosPerPlayer: number
  rejected: number
  kingClass: string
  actions: number
  kills: number
  demonHpLeft: number
  attacks: number
}

function play(seats: number, seed: number): Out {
  let kos = 0
  let kills = 0
  let attacks = 0
  const ctx: Ctx = { log: (_t, k) => { if (k === 'ko') kos++; if (k === 'kill') kills++; if (k === 'attack') attacks++ }, name: (i) => `P${i}` }
  let s: State = createGame(seats, seed)
  let rejected = 0
  let actions = 0
  let before: State | null = null
  let kosBefore = 0
  while (s.phase !== 'over') {
    if (s.phase === 'play' && s.round === 9) { before = s; kosBefore = kos }
    const seat = actors(s)[0] as number
    const level = ((seed + seat) % 3) as BotLevel
    try {
      s = apply(s, seat, botAction(s, seat, level), ctx)
    } catch (e) {
      if (!(e instanceof IllegalAction)) throw e
      rejected++
      s = apply(s, seat, botFallback(s, seat), ctx)
    }
    if (++actions > 6000) throw new Error(`끝나지 않음 seed=${seed}`)
  }
  const king = s.coronation?.king ?? -1
  const pre = before ?? s
  const publicScore = pre.players.map((p) => p.level + p.fame)
  const top = Math.max(...publicScore)
  const allies = pre.players.filter((p) => p.seat !== king)
  const fameTop = allies.reduce((a, b) => (b.fame > a.fame ? b : a), allies[0]!)
  return {
    seats,
    demonWin: s.winner === 'demon',
    kingWasPublicTop: publicScore[king] === top,
    lastHitUnderdog: s.lastHitter === null ? null : s.lastHitter !== fameTop.seat,
    avgLevel: pre.players.reduce((t, p) => t + p.level, 0) / seats,
    kosPerPlayer: kosBefore / seats,
    rejected,
    kingClass: s.players[king]?.cls ?? '-',
    actions,
    kills,
    attacks,
    demonHpLeft: s.demon ? (s.demon.hp / s.demon.maxHp) : 0,
  }
}

const n = Number(process.argv[2] ?? 300)
const pct = (x: number) => `${(x * 100).toFixed(1)}%`
for (const seats of [3, 4, 5]) {
  const outs: Out[] = []
  for (let i = 0; i < n; i++) outs.push(play(seats, 1000 * seats + i))
  const avg = (f: (o: Out) => number) => outs.reduce((t, o) => t + f(o), 0) / outs.length
  const lh = outs.filter((o) => o.lastHitUnderdog !== null)
  const classes: Record<string, number> = {}
  for (const o of outs) classes[o.kingClass] = (classes[o.kingClass] ?? 0) + 1
  console.log(`\n[${seats}석 × ${n}판]`)
  console.log(`  마왕 승률            ${pct(avg((o) => +o.demonWin))}   (목표 35~45%)`)
  console.log(`  검은 왕 = 공개 1위    ${pct(avg((o) => +o.kingWasPublicTop))}   (목표 50~70%)`)
  console.log(`  막타가 명성 1위 아님  ${lh.length ? pct(lh.filter((o) => o.lastHitUnderdog).length / lh.length) : '-'}   (목표 30% 이상, 연합 승리 ${lh.length}판)`)
  console.log(`  대관식 평균 레벨      ${avg((o) => o.avgLevel).toFixed(2)}   (목표 5 안팎)`)
  console.log(`  1인당 쓰러짐(1~9R)    ${avg((o) => o.kosPerPlayer).toFixed(2)}   (목표 1 이하)`)
  console.log(`  평균 행동 수          ${avg((o) => o.actions).toFixed(0)}, 거절 ${avg((o) => o.rejected).toFixed(2)}`)
  console.log(`  처치 ${avg((o) => o.kills).toFixed(1)}, 공격 ${avg((o) => o.attacks).toFixed(1)}, 마왕 남은 체력 ${pct(avg((o) => o.demonHpLeft))}`)
  console.log(`  검은 왕 직업          ${Object.entries(classes).map(([k, v]) => `${k} ${v}`).join(', ')}`)
}
