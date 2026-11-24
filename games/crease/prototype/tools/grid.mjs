// 수치 격자 탐색: node prototype/tools/grid.mjs <players> <games> '<json array of config overrides>'
import { RULES as DEFAULT_CONFIG } from '../rules-config.js'; // 확정 수치 위에 덮어쓴다
import { runBatch, mergeConfig } from '../sim.js';
const [n, games, list] = [Number(process.argv[2]), Number(process.argv[3]), JSON.parse(process.argv[4])];
for (const over of list) {
  const cfg = mergeConfig(DEFAULT_CONFIG, over);
  const r = runBatch(n, games, cfg, ['balanced'], 1000);
  const spread = Math.max(...r.seatWinRate) - Math.min(...r.seatWinRate);
  console.log(JSON.stringify(over), '| seats', r.seatWinRate.join('/'), '| spread', spread.toFixed(3), '| turns', r.avgTurns, '| rounds', r.avgRounds, '| margin', r.avgMargin, '| cover/g', r.coverPerGame);
}
