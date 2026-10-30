// 시드 고정 AI 대 AI 대량 시뮬레이션: npx tsx scripts/simulate.ts --games 100 --players 3 --seed 1
import { createGame } from '../src/core/engine/setup';
import { applyAction } from '../src/core/engine/turn';
import { chooseAction } from '../src/core/ai';
import { ranking } from '../src/core/engine/scoring';
import { mainDoctrine } from '../src/core/engine/derive';
import { researchedCount } from '../src/core/engine/research';
import type { GameState } from '../src/core/types';

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
}

export function playGame(seed: number, players: number, maxSteps = 20000): { state: GameState; steps: number; eraRounds: number[] } {
  let s = createGame(seed, Array.from({ length: players }, (_, i) => ({ name: `AI${i + 1}`, isAI: true })));
  let steps = 0;
  const eraRounds: number[] = [1];
  while (!s.gameOver && steps < maxSteps) {
    const actor = s.pending.length ? s.pending[0].player : s.current;
    const a = chooseAction(s, actor);
    if (!a) throw new Error('AI 가 행동을 내지 못함');
    const r = applyAction(s, actor, a);
    if (r.error) {
      // 잘못된 행동은 차례 종료로 대체
      const e = applyAction(s, actor, s.pending.length ? { type: 'respond', choice: 0 } : { type: 'endTurn' });
      if (e.error) throw new Error(`진행 불가: ${r.error} / ${e.error}`);
      s = e.state;
    } else s = r.state;
    if (s.era > eraRounds.length) eraRounds.push(s.round);
    steps++;
  }
  return { state: s, steps, eraRounds };
}

if (process.argv[1]?.includes('simulate')) {
  const games = arg('games', 50);
  const players = arg('players', 3);
  const seed0 = arg('seed', 1);
  const seatWins = Array(players).fill(0);
  const docWins: Record<string, number> = { ark: 0, symbiont: 0, synth: 0, none: 0 };
  const docCount: Record<string, number> = { ark: 0, symbiont: 0, synth: 0, none: 0 };
  let rounds = 0;
  let unfinished = 0;
  let winScore = 0;
  let nodes = 0;
  const eraStarts = [0, 0, 0, 0];
  const t0 = Date.now();
  for (let g = 0; g < games; g++) {
    const { state, eraRounds } = playGame(seed0 + g, players);
    if (!state.gameOver) unfinished++;
    const r = ranking(state);
    const w = state.players[r[0].player];
    const seat = (w.id - state.startPlayer + players) % players;
    seatWins[seat]++;
    for (const p of state.players) docCount[mainDoctrine(p) ?? 'none']++;
    docWins[mainDoctrine(w) ?? 'none']++;
    rounds += state.round;
    winScore += r[0].total;
    nodes += state.players.reduce((a, p) => a + researchedCount(p), 0) / players;
    eraRounds.forEach((rd, i) => (eraStarts[i] += rd));
  }
  const pct = (n: number, d: number) => `${((100 * n) / Math.max(1, d)).toFixed(1)}%`;
  console.log(`게임 ${games} · ${players}인 · 시드 ${seed0}~ · ${((Date.now() - t0) / 1000).toFixed(1)}초`);
  console.log(`평균 라운드 ${(rounds / games).toFixed(1)} · 미종료 ${unfinished} · 우승 점수 평균 ${(winScore / games).toFixed(1)} · 연구 노드 평균 ${(nodes / games).toFixed(1)}`);
  console.log(`시대 시작 라운드 평균: ${eraStarts.map((x) => (x / games).toFixed(1)).join(' / ')}`);
  console.log(`자리별 승률: ${seatWins.map((w, i) => `${i + 1}번 ${pct(w, games)}`).join(' · ')}`);
  console.log(`주 노선별 승률: ${Object.keys(docWins).map((d) => `${d} ${docWins[d]}/${docCount[d]} (${pct(docWins[d], docCount[d])})`).join(' · ')}`);
}
