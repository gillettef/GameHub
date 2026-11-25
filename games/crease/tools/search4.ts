// 4인 닻 칸·차례 보정 탐색: node --experimental-strip-types tools/search4.ts [games]
import { RULES, mergeConfig } from '../src/engine/rules.ts'
import { runBatch } from '../src/engine/sim.ts'

const G = Number(process.argv[2] ?? 400)
const base = { spawnPerRound: { 4: 0 }, spawnPerTurn: 1, target: { 4: 7 }, initialShards: { 4: 6 }, endMode: 'round' }
const sets: Record<string, [number, number][]> = {
  'A1,I5,I1,A5': [[0, 0], [8, 4], [8, 0], [0, 4]],
  'A1,I5,A5,I1': [[0, 0], [8, 4], [0, 4], [8, 0]],
  'A2,I4,I2,A4': [[0, 1], [8, 3], [8, 1], [0, 3]],
}
const comps: Record<string, number[]> = { none: [0, 0, 0, 0], s02: [1, 0, 1, 0], s2: [0, 0, 1, 0], s23: [0, 0, 1, 1], s123: [0, 1, 1, 1] }
for (const [sn, a] of Object.entries(sets)) {
  for (const [cn, c] of Object.entries(comps)) {
    const r = runBatch(4, G, mergeConfig(RULES, { ...base, anchors: { 4: a }, startCarried: { 4: c } }), ['balanced'], 7000)
    const spread = Math.max(...r.seatWinRate) - Math.min(...r.seatWinRate)
    console.log(spread.toFixed(3), sn, cn, r.seatWinRate.join('/'), 'turns', r.avgTurns, 'tie', r.tieRate)
  }
}
