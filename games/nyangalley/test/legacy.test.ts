/**
 * AI·엔진 진행이 기준 기록과 같은지 본다(바꾸려던 게 아닌 변화를 잡는다).
 * 처음 기록(2026-11-25)은 옛 AI(비동기판)로 만들었다. 2026-11-26 뿌리 놓기를 두 단계로 바꾸며(Rules.md 6.2) 규칙이 바뀌어
 * `npx tsx tools/write-ai-fixtures.ts` 로 지금 코드의 기록을 새 기준으로 남겼다. 같은 날 v7 「골목 일과」(Rules.md 5절)로 바꾸며
 * `npm run fixtures` → `npx tsx tools/write-ai-fixtures.ts` 로 다시 만들었고, 2026-11-27 v8 「행동 하나」로 바꾸며 또 다시 만들었다.
 * 규칙을 의도적으로 바꾸면 다시 만든다:
 *  - fixtures/ai-decisions.json: scenario.json 을 재생한 진행 중 상태(v8: 164개, 가져오기 두 장·놓기·명당 부르기 포함)에서 차례인 자리의 결정
 *  - fixtures/ai-games.json: 2·3·4인 × 시드 4개, AI 끼리 끝까지 둔 판의 행동과 단계마다 상태 해시
 * 엔진은 내용 그대로 옮겼으므로(가져오는 경로만 바뀜) 상태 해시가 같으면 엔진 결과도 같다.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decide } from '../src/ai/search.js';
import { applyAction, createInitialState, createPlayer, joinPlayer, maskState, type Action, type GameState, type PlayerId } from '../src/engine/index.js';

const read = <T>(name: string): T => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;
const hash = (s: GameState) => createHash('sha1').update(JSON.stringify(s)).digest('hex').slice(0, 16);
const NO_LIMIT = 1e9;

describe('옛 AI 와 같은 수', { timeout: 60_000 }, () => {
  it('scenario.json 의 진행 중 상태 전부에서 같은 결정', () => {
    const scenarios = read<{ initial: GameState; steps: { action: Action }[] }[]>('scenario.json');
    const expected = read<{ scenario: number; step: number; playerId: PlayerId; action: Action }[]>('ai-decisions.json');
    let k = 0;
    for (const [si, sc] of scenarios.entries()) {
      let s = sc.initial;
      for (const [i, step] of sc.steps.entries()) {
        if (s.phase === 'playing' && s.currentPlayerId) {
          const want = expected[k++]!;
          expect([want.scenario, want.step]).toEqual([si, i]);
          expect(decide(maskState(s, want.playerId), want.playerId, NO_LIMIT).action).toEqual(want.action);
        }
        s = applyAction(s, step.action).state;
      }
    }
    expect(k).toBe(expected.length);
  });

  it('AI 끼리 둔 판: 행동과 단계마다 상태 해시가 같다', () => {
    const games = read<{ players: number; seed: number; steps: { action: Action; hash: string }[] }[]>('ai-games.json');
    expect(games.length).toBe(12);
    for (const g of games) {
      let s = createInitialState('legacy', g.seed);
      for (let i = 0; i < g.players; i++) s = joinPlayer(s, createPlayer(`p${i}`, `AI ${i}`, 'ai')).state;
      s = applyAction(s, { type: 'READY', playerId: 'p0' }).state;
      if (s.phase === 'lobby') s = applyAction(s, { type: 'READY', playerId: 'p0' }).state;
      for (const step of g.steps) {
        const pid = s.currentPlayerId as PlayerId;
        const action = decide(maskState(s, pid), pid, NO_LIMIT).action;
        expect(action).toEqual(step.action);
        const r = applyAction(s, action);
        expect(r.error).toBeUndefined();
        s = r.state;
        expect(hash(s)).toBe(step.hash);
      }
      expect(s.phase).toBe('finished');
    }
  });
});
