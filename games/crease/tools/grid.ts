// 수치 격자 탐색: node --experimental-strip-types tools/grid.ts <players> <games> '<json array of config overrides>' (확정 수치 RULES 위에 덮어쓴다)
import { RULES, mergeConfig } from '../src/engine/rules.ts'
import { runBatch } from '../src/engine/sim.ts'

const n = Number(process.argv[2])
const games = Number(process.argv[3])
const list = JSON.parse(process.argv[4] ?? '[]') as Record<string, unknown>[]
for (const over of list) {
  const r = runBatch(n, games, mergeConfig(RULES, over), ['balanced'], 1000)
  const spread = Math.max(...r.seatWinRate) - Math.min(...r.seatWinRate)
  console.log(JSON.stringify(over), '| seats', r.seatWinRate.join('/'), '| spread', spread.toFixed(3), '| turns', r.avgTurns, '| rounds', r.avgRounds, '| margin', r.avgMargin, '| cover/g', r.coverPerGame)
}
