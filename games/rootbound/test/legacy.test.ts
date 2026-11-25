/**
 * 옛 AI(비동기·이벤트 루프 양보판, 2026-11-25 이전 server/src/ai/search.ts)와 지금 AI(동기판)가 같은 수를 고르는지 본다.
 * 기록은 옛 코드로 만들었다(생성 스크립트는 저장소 밖, 시간 제한 없이):
 *  - fixtures/ai-decisions.json: scenario.json 을 재생한 진행 중 상태 178개에서 차례인 자리의 결정
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
