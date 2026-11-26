/**
 * test/legacy.test.ts 의 AI 기준 기록을 지금 엔진·AI 로 다시 만든다.
 *   npx tsx tools/write-ai-fixtures.ts   (먼저 npm run fixtures 로 scenario.json 을 만든 뒤)
 *
 * 처음 기록(2026-11-25)은 옛 AI(비동기판)로 저장소 밖 스크립트가 만들었다. 2026-11-26 뿌리 놓기를 두 단계로 바꾸며
 * (Rules.md 6.2), 같은 날 v7 「골목 일과」(Rules.md 5절)로 바꾸며 규칙이 의도적으로 바뀌어 지금 코드로 새 기준을 남긴다.
 * 판 목록(인원·시드)은 처음 기록 그대로다.
 *  - ai-decisions.json: scenario.json 을 재생한 진행 중 상태마다 차례인 자리의 결정
 *  - ai-games.json: 2·3·4인 × 시드 4개, AI 끼리 끝까지 둔 판의 행동과 단계마다 상태 해시
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { decide } from '../src/ai/search.js';
import { applyAction, createInitialState, createPlayer, joinPlayer, maskState, type Action, type GameState, type PlayerId } from '../src/engine/index.js';

const dir = new URL('../test/fixtures/', import.meta.url);
const read = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, dir), 'utf8')) as T;
const hash = (s: GameState) => createHash('sha1').update(JSON.stringify(s)).digest('hex').slice(0, 16);
const NO_LIMIT = 1e9;

const scenarios = read<{ initial: GameState; steps: { action: Action }[] }[]>('scenario.json');
const decisions: { scenario: number; step: number; playerId: PlayerId; action: Action }[] = [];
for (const [si, sc] of scenarios.entries()) {
  let s = sc.initial;
  for (const [i, step] of sc.steps.entries()) {
    if (s.phase === 'playing' && s.currentPlayerId) {
      const pid = s.currentPlayerId;
      decisions.push({ scenario: si, step: i, playerId: pid, action: decide(maskState(s, pid), pid, NO_LIMIT).action });
    }
    s = applyAction(s, step.action).state;
  }
}
writeFileSync(new URL('ai-decisions.json', dir), JSON.stringify(decisions));

const list = read<{ players: number; seed: number }[]>('ai-games.json').map(({ players, seed }) => ({ players, seed }));
const games = list.map(({ players, seed }) => {
  let s = createInitialState('legacy', seed);
  for (let i = 0; i < players; i++) s = joinPlayer(s, createPlayer(`p${i}`, `AI ${i}`, 'ai')).state;
  s = applyAction(s, { type: 'READY', playerId: 'p0' }).state;
  if (s.phase === 'lobby') s = applyAction(s, { type: 'READY', playerId: 'p0' }).state;
  const steps: { action: Action; hash: string }[] = [];
  while (s.phase !== 'finished') {
    const pid = s.currentPlayerId as PlayerId;
    const action = decide(maskState(s, pid), pid, NO_LIMIT).action;
    const r = applyAction(s, action);
    if (r.error) throw new Error(`${players}인 시드 ${seed}: ${r.error}`);
    s = r.state;
    steps.push({ action, hash: hash(s) });
  }
  return { players, seed, steps };
});
writeFileSync(new URL('ai-games.json', dir), JSON.stringify(games));
console.log(`결정 ${decisions.length}개, 판 ${games.length}개`);
