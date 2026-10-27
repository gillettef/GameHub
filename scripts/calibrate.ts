/**
 * 가치형 AI의 예측 승률이 실제 계약 성공률과 맞는지 확인한다 (구간별 비교).
 *   npx tsx scripts/calibrate.ts --players 3 --games 200 --rules ...
 */
import { AI_MODEL, AI_TRACE, PERSONAS, RULES, createGame, createRng, nextRound, resolveRound } from '../src/core';
import type { GameState } from '../src/core';

declare const process: { argv: string[] };
const args = process.argv.slice(2);
const arg = (k: string, d: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : d;
};
const N = Number(arg('players', '3'));
const GAMES = Number(arg('games', '200'));
for (const kv of arg('rules', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  (RULES as unknown as Record<string, unknown>)[k!] = v === 'null' ? null : v!.includes('/') ? v!.split('/').map(Number) : Number(v);
}
for (const kv of arg('model', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  (AI_MODEL as Record<string, number>)[k!] = Number(v);
}
for (const kv of arg('persona', '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  (PERSONAS.balanced as unknown as Record<string, number>)[k!] = Number(v);
}
const rng = createRng(1);
const bins = Array.from({ length: 10 }, () => ({ n: 0, pred: 0, won: 0 }));
AI_TRACE.on = true;
for (let g = 0; g < GAMES; g++) {
  let s: GameState = createGame(
    Array.from({ length: N }, (_, i) => ({ name: `A${i}`, kind: 'ai' as const, persona: 'balanced' as const })),
    rng.int(2 ** 31),
  );
  while (s.phase !== 'done') {
    AI_TRACE.items = [];
    s = resolveRound(s, {});
    const r = s.results.at(-1)!;
    for (const t of AI_TRACE.items) {
      // v6: 라운드마다 1·2차 두 건. 같은 에이전트의 1·2차는 선수가 달라 (agent, 선수)로 짝짓는다
      const e = r.entries.find((x) => x.agent === t.agent && x.offer?.playerId === t.playerId);
      if (!e || e.status === 'pass' || e.status === 'invalid') continue;
      const b = bins[Math.min(9, Math.floor(t.predicted * 10))]!;
      b.n++;
      b.pred += t.predicted;
      b.won += e.status === 'won' ? 1 : 0;
    }
    s = nextRound(s);
  }
}
console.log(`# 예측 승률 보정 N=${N}`);
for (const [i, b] of bins.entries()) if (b.n) console.log(`${i * 10}~${i * 10 + 10}%: ${b.n}건 · 예측 ${Math.round((b.pred / b.n) * 100)}% · 실제 ${Math.round((b.won / b.n) * 100)}%`);
