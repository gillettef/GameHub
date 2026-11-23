// CREASE 밸런스 시뮬레이터
// 사용: node prototype/sim.js [--games 500] [--players 2,3,4] [--profiles balanced,greedy] [--config '{"target":{"2":6}}']
import { newGame, playTurn, winners, isCoveredCol, DEFAULT_CONFIG, mulberry32 } from './engine.js';
import { chooseTurn } from './bot.js';
import { RULES } from './rules-config.js';

function parseArgs(argv) {
  const out = { games: 500, players: [2, 3, 4], profiles: null, config: {}, seed: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--games') out.games = Number(argv[++i]);
    else if (a === '--players') out.players = argv[++i].split(',').map(Number);
    else if (a === '--profiles') out.profiles = argv[++i].split(',');
    else if (a === '--config') out.config = JSON.parse(argv[++i]);
    else if (a === '--seed') out.seed = Number(argv[++i]);
    else if (a === '--base') out.base = argv[++i];
  }
  return out;
}

export function mergeConfig(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...base[k], ...v } : v;
  }
  return out;
}

export function runGame(n, seed, config, profiles) {
  const s = newGame(n, seed, config);
  const rnd = mulberry32(seed * 7919 + 13);
  const stats = { folds: 0, unfolds: 0, foldWidths: {}, coverEvents: 0, absentTurns: 0, turns: 0 };
  let guard = 0;
  while (!s.over && guard++ < 400) {
    const me = s.players[s.current];
    if (isCoveredCol(s.fold, me.c)) stats.absentTurns++;
    const before = s.players.map((p) => isCoveredCol(s.fold, p.c));
    const acts = chooseTurn(s, profiles[s.current % profiles.length], rnd);
    for (const a of acts) {
      if (a.type === 'fold') { stats.folds++; stats.foldWidths[a.width] = (stats.foldWidths[a.width] || 0) + 1; }
      if (a.type === 'unfold') stats.unfolds++;
    }
    playTurn(s, acts);
    s.players.forEach((p, i) => { if (i !== me.id && !before[i] && isCoveredCol(s.fold, p.c)) stats.coverEvents++; });
    stats.turns++;
  }
  return { winners: winners(s), rounds: s.round, scores: s.players.map((p) => p.score), stats, timeout: guard >= 400 };
}

export function runBatch(n, games, config, profiles, seed0 = 1) {
  const wins = new Array(n).fill(0);
  let rounds = 0; let turns = 0; let folds = 0; let unfolds = 0; let covers = 0; let absent = 0; let timeouts = 0;
  let margin = 0; let ties = 0;
  const widths = {};
  const roundHist = {};
  for (let g = 0; g < games; g++) {
    const r = runGame(n, seed0 + g, config, profiles);
    for (const w of r.winners) wins[w] += 1 / r.winners.length;
    if (r.winners.length > 1) ties++;
    rounds += r.rounds; turns += r.stats.turns; folds += r.stats.folds; unfolds += r.stats.unfolds;
    covers += r.stats.coverEvents; absent += r.stats.absentTurns; timeouts += r.timeout ? 1 : 0;
    const sorted = [...r.scores].sort((a, b) => b - a);
    margin += sorted[0] - sorted[1];
    for (const [w, c] of Object.entries(r.stats.foldWidths)) widths[w] = (widths[w] || 0) + c;
    roundHist[r.rounds] = (roundHist[r.rounds] || 0) + 1;
  }
  return {
    players: n, games,
    seatWinRate: wins.map((w) => +(w / games).toFixed(3)),
    avgRounds: +(rounds / games).toFixed(1),
    avgTurns: +(turns / games).toFixed(1),
    foldPerTurn: +(folds / turns).toFixed(2),
    unfoldPerTurn: +(unfolds / turns).toFixed(2),
    coverPerGame: +(covers / games).toFixed(1),
    absentTurnRate: +(absent / turns).toFixed(3),
    avgMargin: +(margin / games).toFixed(2),
    tieRate: +(ties / games).toFixed(3),
    foldWidths: widths,
    timeouts,
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('prototype/sim.js');
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const config = mergeConfig(args.base === 'default' ? DEFAULT_CONFIG : RULES, args.config);
  for (const n of args.players) {
    const profiles = args.profiles || ['balanced'];
    const res = runBatch(n, args.games, config, profiles, args.seed);
    console.log(JSON.stringify({ profiles, ...res }));
  }
}
