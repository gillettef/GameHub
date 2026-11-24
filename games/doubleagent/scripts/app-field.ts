/**
 * 앱 대진 점검: 사람 자리에 고정 전략(항상 최저/최고 카드·균형형)을 넣고 나머지는 앱의 '보통' AI(level normal → NORMAL_FIELD 회전).
 * 사람이 단순 전략으로 보통 AI를 공략할 수 있는지, AI 한 수에 걸리는 시간을 본다.
 *   npx tsx scripts/app-field.ts [--games 1000] [--players 4] [--seed 42]
 */
import { createGame, createRng, makeAiOffer, nextRound, resolveRound, winners } from '../src/core';
import type { GameState, PersonaKey } from '../src/core';

declare const process: { argv: string[] };
declare const performance: { now(): number };
const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : d;
};
const GAMES = Number(arg('games', '1000'));
const N = Number(arg('players', '4'));
const rng = createRng(Number(arg('seed', '42')));

for (const probe of ['low', 'high', 'balanced', 'random'] as PersonaKey[]) {
  let win = 0;
  for (let g = 0; g < GAMES; g++) {
    const seat = g % N;
    let s: GameState = createGame(
      Array.from({ length: N }, (_, i) => (i === seat ? { name: 'P', kind: 'ai' as const, persona: probe } : { name: `AI${i}`, kind: 'ai' as const, level: 'normal' as const })),
      rng.int(2 ** 31),
    );
    while (s.phase !== 'done') s = nextRound(resolveRound(s, {}));
    const ws = winners(s);
    if (ws.includes(seat)) win += 1 / ws.length;
  }
  console.log(`${N}인 · 사람 자리 ${probe} vs 보통 AI ${N - 1}명: 승률 ${Math.round((win / GAMES) * 1000) / 10}% (공정값 ${Math.round(1000 / N) / 10}%)`);
}

// 보통 AI 한 수 시간 (라운드 시작 상태에서 균형형 자리)
let s: GameState = createGame(Array.from({ length: N }, (_, i) => ({ name: `AI${i}`, kind: 'ai' as const, level: 'normal' as const })), 1);
const times: number[] = [];
while (s.phase !== 'done') {
  const t = performance.now();
  makeAiOffer({ ...s }, 0, createRng(s.round));
  times.push(performance.now() - t);
  s = nextRound(resolveRound(s, {}));
}
console.log(`보통 AI(균형형) 한 수: 평균 ${Math.round(times.reduce((a, b) => a + b, 0) / times.length)}ms · 최대 ${Math.round(Math.max(...times))}ms`);
