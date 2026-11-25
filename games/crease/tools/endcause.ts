// 종료 원인 분포: 목표 점수 도달 대 공급 소진. 사용: node --experimental-strip-types tools/endcause.ts '<json overrides>' [games]
import { mulberry32, newGame, winners } from '../src/engine/engine.ts'
import { RULES, mergeConfig, per } from '../src/engine/rules.ts'
import { playBotTurn } from '../src/engine/sim.ts'

const cfg = mergeConfig(RULES, JSON.parse(process.argv[2] ?? '{}'))
const G = Number(process.argv[3] ?? 300)
for (const n of [2, 3, 4]) {
  let deckEnd = 0
  let ties = 0
  let turns = 0
  const wins = new Array<number>(n).fill(0)
  for (let g = 0; g < G; g++) {
    const s = newGame(n, 500 + g, cfg)
    const rnd = mulberry32(g + 77)
    let k = 0
    while (!s.over && k++ < 500) playBotTurn(s, 'balanced', rnd)
    if (Math.max(...s.players.map((p) => p.score)) < per(cfg.target, n)) deckEnd++
    const w = winners(s)
    if (w.length > 1) ties++
    for (const i of w) wins[i]! += 1 / w.length
    turns += s.turn
  }
  console.log(n, 'P | 카드 소진 종료', (deckEnd / G).toFixed(2), '| 동점', (ties / G).toFixed(2), '| 차례', (turns / G).toFixed(1), '| 좌석', wins.map((w) => (w / G).toFixed(3)).join('/'))
}
