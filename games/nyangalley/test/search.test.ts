/**
 * AI 탐색(search.ts)이 시간 제한 안에 합법 수를 고르는지 확인한다. 예전 Python ai/tests/test_api.py 를 옮겼다.
 * 상태는 test/fixtures/scenario.json(2·3·4인 판 기록, 기권·마켓 빈 라운드·v8 「행동 하나」의 두 단계 포함)을 엔진으로 재생해 얻는다.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Action, GameState, PlayerId, RoundStage } from '../src/engine/index.js';
import { actOptions, applyAction, maskState } from '../src/engine/index.js';
import { AI_TIME_LIMIT_MS, actCandidates, decide, requestAiDecision, takeGoalBonus, unseenCards } from '../src/ai/search.js';

interface Scenario {
  initial: GameState;
  steps: { action: Action }[];
}

const scenarios: Scenario[] = JSON.parse(readFileSync(new URL('./fixtures/scenario.json', import.meta.url), 'utf8'));

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

const stage = (st: RoundStage, market?: boolean) => replayed.filter((s) => s.stage === st && (market === undefined || s.market.length > 0 === market));
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

  it('가져오기 두 번째 장 단계에서는 합법인 TAKE 를 고른다', async () => {
    const states = sample(stage('take'), 10);
    expect(states.length).toBeGreaterThan(3);
    for (const s of states) {
      const pid = s.currentPlayerId as PlayerId;
      const { action, depth } = await decideMasked(s, pid);
      expect(depth).toBe(1);
      expect(action.type).toBe('TAKE');
      expectLegal(s, action);
    }
  });

  it('행동 고르기 단계에서는 합법인 TAKE·PLANT·DISCARD·CALL 을 고르고 씨앗은 민들레에만 둔다', async () => {
    const states = [...sample(stage('act', true), 12), ...sample(stage('act', false), 4)];
    expect(states.length).toBeGreaterThan(10);
    const kinds = new Set<string>();
    for (const s of states) {
      const pid = s.currentPlayerId as PlayerId;
      const { action, depth } = await decideMasked(s, pid);
      expect(depth).toBe(1);
      expect(['TAKE', 'PLANT', 'DISCARD', 'CALL']).toContain(action.type);
      if (action.type === 'PLANT' && action.species !== 'dandelion') expect('seed' in action).toBe(false);
      expectLegal(s, action);
      kinds.add(action.type);
    }
    // 한 가지 행동만 고르지 않는다
    expect(kinds.size).toBeGreaterThan(1);
  });

  it('행동 후보: 할 수 있는 행동 종류마다 하나씩, 값은 유한하다', () => {
    for (const s of sample(stage('act'), 10)) {
      const pid = s.currentPlayerId as PlayerId;
      const masked = maskState(s, pid);
      const cands = actCandidates(masked, pid, performance.now() + 10_000);
      const o = actOptions(s, pid);
      const types = cands.map((c) => c.action.type);
      expect(types.includes('PLANT')).toBe(o.plant);
      expect(types.includes('CALL')).toBe(o.call);
      expect(types.includes('TAKE')).toBe(o.take);
      for (const c of cands) {
        expect(Number.isFinite(c.value)).toBe(true);
        expectLegal(s, c.action);
      }
    }
  });

  it('손이 비면(심을 카드 없음) 가져오기나 부르기를 고르고, 부를 식물도 없으면 가져온다', async () => {
    const empty = sample(stage('act', true), 10).map((s) => ({ ...s, players: s.players.map((p) => (p.id === s.currentPlayerId ? { ...p, hand: [] } : p)) }));
    for (const s of empty) {
      const pid = s.currentPlayerId as PlayerId;
      const { action } = await decideMasked(s, pid);
      expect(['TAKE', 'CALL']).toContain(action.type);
      expectLegal(s, action);
      // 내 땅 위 식물을 모두 치우면 부를 수 없다
      const noCall = { ...s, plants: [] };
      const d = await decideMasked(noCall, pid);
      expect(d.action.type).toBe('TAKE');
      expectLegal(noCall, d.action);
    }
  });

  it('손이 3장이면 가져오기를 고르지 않는다', async () => {
    for (const s of sample(stage('act', true), 6)) {
      const pid = s.currentPlayerId as PlayerId;
      const full = { ...s, players: s.players.map((p) => (p.id === pid ? { ...p, hand: [s.species[0]!, s.species[1]!, s.species[2]!] } : p)) };
      const { action } = await decideMasked(full, pid);
      expect(action.type).not.toBe('TAKE');
      expectLegal(full, action);
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

  it('주머니 두 번째 장 단계에서는 늘 주머니. 가져오기 후보는 펼친 타일 1장(같은 종이면 앞 자리)과 주머니, 더미가 비면 주머니는 후보가 아니다', async () => {
    const t = stage('take')[0]!;
    const tp = t.currentPlayerId as PlayerId;
    expect((await decide(maskState(t, tp), tp, 60_000)).action).toEqual({ type: 'TAKE', playerId: tp, take: 'pile' });
    const s = replayed.find((x) => x.stage === 'act' && x.market.length > 0 && (x.players.find((p) => p.id === x.currentPlayerId)?.hand.length ?? 3) < 3)!;
    const pid = s.currentPlayerId as PlayerId;
    const takes = (st: GameState) => actCandidates(st, pid, performance.now() + 60_000).filter((c) => c.action.type === 'TAKE').map((c) => (c.action as { take: number | 'pile' }).take);
    expect(takes({ ...s, market: [s.market[0]!, s.market[0]!], pile: [] })).toEqual([0]);
    expect(takes(s)).toContain('pile');
  });

  it('제한 시간이 아주 짧아도(최소 예산 50ms) 합법 수를 돌려준다', async () => {
    const s = stage('act', true)[0]!;
    const pid = s.currentPlayerId as PlayerId;
    const d = await decide(maskState(s, pid), pid, 0);
    expectLegal(s, d.action);
  });

  it('서버 진입점은 입력 상태를 바꾸지 않는다', async () => {
    const s = sample(stage('act', true), 3)[1]!;
    const before = JSON.stringify(s);
    const action = await requestAiDecision(s, s.currentPlayerId as PlayerId);
    expect(action).not.toBeNull();
    expectLegal(s, action!);
    expect(JSON.stringify(s)).toBe(before);
  });
});
