// CREASE 밸런스 시뮬레이터 CLI
// 사용: npm run sim -- [--games 500] [--players 2,3,4] [--profiles balanced,greedy] [--config '{"target":{"2":6}}'] [--seed 1] [--base default]
import { isProfileName, type ProfileName } from '../src/engine/bot.ts'
import { DEFAULT_CONFIG, RULES, mergeConfig } from '../src/engine/rules.ts'
import { runBatch } from '../src/engine/sim.ts'

const args = { games: 500, players: [2, 3, 4], profiles: ['balanced'] as ProfileName[], config: {}, seed: 1, base: 'rules' }
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const v = argv[i + 1] ?? ''
  if (argv[i] === '--games') args.games = Number(v)
  else if (argv[i] === '--players') args.players = v.split(',').map(Number)
  else if (argv[i] === '--profiles') args.profiles = v.split(',').filter(isProfileName)
  else if (argv[i] === '--config') args.config = JSON.parse(v)
  else if (argv[i] === '--seed') args.seed = Number(v)
  else if (argv[i] === '--base') args.base = v
  else continue
  i++
}
const config = mergeConfig(args.base === 'default' ? DEFAULT_CONFIG : RULES, args.config)
for (const n of args.players) console.log(JSON.stringify({ profiles: args.profiles, ...runBatch(n, args.games, config, args.profiles, args.seed) }))
