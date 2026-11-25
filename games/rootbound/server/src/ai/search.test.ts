/**
 * AI 탐색(search.ts)이 시간 제한 안에 합법 수를 고르는지 확인한다. 예전 Python ai/tests/test_api.py 를 옮겼다.
 * 상태는 shared/fixtures/scenario.json(2·3·4인 판 기록, 기권·마켓 빈 라운드 포함)을 엔진으로 재생해 얻는다.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Action, GameState, PlayerId } from '@rootbound/shared';
import { applyAction, maskState } from '@rootbound/shared';
import { AI_TIME_LIMIT_MS, decide, requestAiDecision, takeGoalBonus, unseenCards } from './search.js';

interface Scenario {
  initial: GameState;
  steps: { action: Action }[];
}

const scenarios: Scenario[] = JSON.parse(readFileSync(new URL('../../../shared/fixtures/scenario.json', import.meta.url), 'utf8'));

/** 시나리오를 재생한 진행 중 상태 전부 */
const replayed: GameState[] = scenarios.flatMap((sc) => {
  const out: GameState[] = [];
  let s = sc.initial;
  for (const step of sc.steps) {
    if (s.phase === 'playing') out.push(s);
    const r = applyAction(s, step.action);
    if (r.error) throw new Error(r.error);
    s = r.state;
  }
  return out;
});

const stage = (st: 'take' | 'plant', market?: boolean) => replayed.filter((s) => s.stage === st && (market === undefined || s.market.length > 0 === market));
const sample = <T>(xs: T[], n: number) => xs.filter((_, i) => i % Math.max(1, Math.floor(xs.length / n)) === 0);

function expectLegal(state: GameState, action: Action): void {
  expect(applyAction(state, action).error).toBeUndefined();
}

async function decideMasked(state: GameState, pid: PlayerId) {
  const d = await decide(maskState(state, pid), pid, AI_TIME_LIMIT_MS);
  expect(d.elapsedMs).toBeLessThan(AI_TIME_LIMIT_MS);
  return d;
}

describe('AI 탐색', () => {
  it('공개 단계에서는 확인한다', async () => {
    for (const sc of scenarios) {
      expect(sc.initial.phase).toBe('reveal');
      const { action } = await decideMasked(sc.initial, 'p0');
      expect(action).toEqual({ type: 'CONFIRM', playerId: 'p0' });
      expectLegal(sc.initial, action);
    }
  });

  it('가져오기 단계에서는 합법인 TAKE 를 고른다', async () => {
    for (const s of sample(stage('take'), 10)) {
      const pid = s.currentPlayerId as PlayerId;
      const { action, depth } = await decideMasked(s, pid);
      expect(depth).toBe(1);
      expect(action.type).toBe('TAKE');
      expectLegal(s, action);
    }
  });

  it('심기 단계에서는 합법인 PLANT·DISCARD 를 고르고 씨앗은 민들레에만 둔다', async () => {
    for (const s of [...sample(stage('plant', true), 8), ...sample(stage('plant', false), 4)]) {
      const pid = s.currentPlayerId as PlayerId;
      const { action } = await decideMasked(s, pid);
      expect(['PLANT', 'DISCARD']).toContain(action.type);
      if (action.type === 'PLANT' && action.species !== 'dandelion') expect('seed' in action).toBe(false);
      expectLegal(s, action);
    }
  });

  it('기권한 사람이 있는 판에서도 합법 수를 고른다', async () => {
    const after = replayed.filter((s) => s.players.some((p) => p.surrenderedOrder !== null));
    expect(after.length).toBeGreaterThan(0);
    for (const s of after.slice(0, 4)) expectLegal(s, (await decideMasked(s, s.currentPlayerId as PlayerId)).action);
  });

  it('보호구역 종에 가져오기 가산을 가장 크게 준다', () => {
    const s = scenarios[0]!.initial;
    const reserve = s.goals.find((g) => g.endsWith('-reserve'))!;
    const sp = reserve.slice(0, -'-reserve'.length) as (typeof s.species)[number];
    const others = s.species.filter((x) => x !== sp);
    expect(takeGoalBonus(s.goals, sp)).toBeGreaterThan(Math.max(...others.map((x) => takeGoalBonus(s.goals, x))));
  });

  it('더미 뒷면은 못 본 카드 분포만 본다: 더미 순서를 바꾸거나 가려도 같은 수', async () => {
    for (const s of sample(stage('take'), 6)) {
      const pid = s.currentPlayerId as PlayerId;
      const unseen = unseenCards(s, pid);
      expect([...unseen.values()].reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(s.pile.length);
      const a = (await decide(s, pid, 60_000)).action;
      const b = (await decide({ ...s, pile: [...s.pile].reverse() }, pid, 60_000)).action;
      const c = (await decide(maskState(s, pid), pid, 60_000)).action;
      expect(b).toEqual(a);
      expect(c).toEqual(a);
    }
  });

  it('같은 종 두 장이면 앞 자리를 고르고, 더미가 비면 더미는 후보가 아니다', async () => {
    const s = stage('take')[0]!;
    const pid = s.currentPlayerId as PlayerId;
    const { action } = await decide({ ...s, market: [s.market[0]!, s.market[0]!], pile: [] }, pid, 60_000);
    expect(action).toEqual({ type: 'TAKE', playerId: pid, take: 0 });
  });

  it('제한 시간이 아주 짧아도(최소 예산 50ms) 합법 수를 돌려준다', async () => {
    const s = stage('plant', true)[0]!;
    const pid = s.currentPlayerId as PlayerId;
    const d = await decide(maskState(s, pid), pid, 0);
    expectLegal(s, d.action);
  });

  it('서버 진입점은 입력 상태를 바꾸지 않는다', async () => {
    const s = sample(stage('plant', true), 3)[1]!;
    const before = JSON.stringify(s);
    const action = await requestAiDecision(s, s.currentPlayerId as PlayerId);
    expect(action).not.toBeNull();
    expectLegal(s, action!);
    expect(JSON.stringify(s)).toBe(before);
  });
});
