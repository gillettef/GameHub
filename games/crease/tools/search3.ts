// 3·4인 닻 칸·차례 보정 탐색: node --experimental-strip-types tools/search3.ts <players 3|4> [games] [endModes]
import { RULES, mergeConfig, type Config } from '../src/engine/rules.ts'
import { runBatch } from '../src/engine/sim.ts'

const n = Number(process.argv[2] ?? 3)
const G = Number(process.argv[3] ?? 800)
const base = { spawnPerRound: { 2: 0, 3: 0, 4: 0 }, spawnPerTurn: 1, target: { 2: 10, 3: 8, 4: 7 }, initialShards: { 2: 6, 3: 6, 4: 6 } }
type Anchors = [number, number][]
const sets: Record<string, Anchors> =
  n === 3
    ? {
        'A1,I3,A5': [[0, 0], [8, 2], [0, 4]],
        'A2,I3,A4': [[0, 1], [8, 2], [0, 3]],
        'I3,A1,A5': [[8, 2], [0, 0], [0, 4]],
        'A1,A5,I3': [[0, 0], [0, 4], [8, 2]],
        'A2,A4,I3': [[0, 1], [0, 3], [8, 2]],
        'I3,A2,A4': [[8, 2], [0, 1], [0, 3]],
      }
    : {
        'A1,I5,I1,A5': [[0, 0], [8, 4], [8, 0], [0, 4]],
        'A1,I1,I5,A5': [[0, 0], [8, 0], [8, 4], [0, 4]],
        'A2,I4,I2,A4': [[0, 1], [8, 3], [8, 1], [0, 3]],
        'A1,I5,A5,I1': [[0, 0], [8, 4], [0, 4], [8, 0]],
      }
const comps: Record<string, number[]> =
  n === 3 ? { none: [0, 0, 0], last1: [0, 0, 1], late: [0, 1, 1] } : { none: [0, 0, 0], last2: [0, 0, 1, 1], last1: [0, 0, 0, 1], s23: [0, 1, 1, 1] }
const rows = []
for (const [sn, a] of Object.entries(sets)) {
  for (const [cn, c] of Object.entries(comps)) {
    for (const em of (process.argv[4] ?? 'round,lastTurn').split(',')) {
      const cfg = mergeConfig(RULES, { ...base, endMode: em as Config['endMode'], anchors: { [n]: a }, startCarried: { [n]: c } })
      const r = runBatch(n, G, cfg, ['balanced'], 5000)
      rows.push({ sn, cn, em, spread: Math.max(...r.seatWinRate) - Math.min(...r.seatWinRate), seats: r.seatWinRate.join('/'), turns: r.avgTurns })
    }
  }
}
rows.sort((x, y) => x.spread - y.spread)
for (const r of rows.slice(0, 10)) console.log(r.spread.toFixed(3), r.sn, r.cn, r.em, r.seats, 'turns', r.turns)
