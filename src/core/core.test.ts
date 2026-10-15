import { describe, expect, it } from 'vitest';
import {
  CLUBS,
  PLAYERS,
  TOTAL_ROUNDS,
  createGame,
  createRng,
  demandRemaining,
  evaluateOffer,
  makeAiOffer,
  makeAiOffers,
  stars,
  clientOutcomes,
  dealRound,
  marketSize,
  nextRound,
  rankings,
  resolveRound,
  validateOffer,
} from './index';
import type { AgentState, EventKey, GameState, Offer, RoundSubmission, Submission } from './types';

// 선수: 0 강태오 FW 몸값8 스타 기본4 / 1 윤시후 MF 몸값6 플메 기본3 / 3 최준서 FW 몸값3 유망주 기본2 / 6 정우진 DF 몸값2 멀티 기본2
// 구단: 0 블루 드래곤즈 10 FW 스타 / 1 실버 호크스 8 MF 플메 / 5 노바 크루저스 6 DF 베테랑 / 6 썬더 울브스 5 FW 유망주

const agent = (over: Partial<AgentState> = {}): AgentState => ({
  name: 'A', kind: 'human', score: 0, deals: 0, demandUsed: [], tactics: ['charm', 'leak', 'fast', 'low', 'hijack'], hand: [], clients: [], pending: null, ...over,
});

const state = (over: Partial<GameState> = {}): GameState => ({
  v: 4, rng: 1, round: 1, phase: 'bid', event: 'normal', nextEvent: 'normal',
  // 2~3인은 대어 2명 → 기본 시장의 두 선수 모두 대어
  market: [3, 6], clubs: [0, 1, 5, 6], sold: [],
  agents: [agent({ name: 'A' }), agent({ name: 'B' })],
  results: [],
  ...over,
});

/** 최준서 → 썬더 울브스, 요구 2: 매력도 3 − 2 = 1, 수수료 2 + 2 = 4 */
const offer = (over: Partial<Offer> = {}): Offer => ({ playerId: 3, clubId: 6, demand: 2, tactic: null, ...over });
/** 정우진 → 노바 크루저스, 요구 2: 매력도 2 − 2 = 0, 수수료 4 */
const df = offer({ playerId: 6, clubId: 5 });
const ev = (o: Offer, e: EventKey = 'normal') => evaluateOffer(o, e);

describe('evaluateOffer (정수 계산)', () => {
  it('매력도 = 적합도 + 전략 − 요구 수수료, 수수료 = 기본 + 요구 수수료', () => {
    expect(ev(offer())).toEqual({ attract: 1, fee: 4 });
    expect(ev(offer({ demand: 4 }))).toEqual({ attract: -1, fee: 6 });
    expect(ev(df)).toEqual({ attract: 0, fee: 4 });
  });

  it('포지션/특성 불일치면 가산 없음, 제시액은 매력도에 들어가지 않음', () => {
    // 정우진(DF 멀티) → 실버 호크스(MF 플메, 제시액 8)
    expect(ev(offer({ playerId: 6, clubId: 1, demand: 1 }))).toEqual({ attract: -1, fee: 3 });
    // 최준서 → 블루 드래곤즈(제시액 10, FW): 포지션만 일치
    expect(ev(offer({ clubId: 0 }))).toEqual({ attract: 0, fee: 4 });
  });

  it('전략 카드 효과', () => {
    expect(ev(offer({ tactic: 'charm' }))).toEqual({ attract: 3, fee: 4 });
    expect(ev(offer({ tactic: 'leak' }))).toEqual({ attract: 5, fee: 3 });
    expect(ev(offer({ tactic: 'fast' }))).toEqual({ attract: 2, fee: 5 });
    expect(ev(offer({ tactic: 'low' }))).toEqual({ attract: 3, fee: 4 });
    expect(ev(offer({ tactic: 'hijack' }))).toEqual({ attract: 4, fee: 4 });
  });

  it('이벤트 효과', () => {
    expect(ev(offer(), 'fw')).toEqual({ attract: 1, fee: 5 });
    expect(ev(df, 'fw')).toEqual({ attract: 0, fee: 4 }); // DF는 해당 없음
    expect(ev(offer(), 'young')).toEqual({ attract: 1, fee: 5 });
    expect(ev(df, 'young')).toEqual({ attract: 0, fee: 4 });
  });

  it('몸값 조건: 제시액 ≥ 몸값 (실속 협상 −3, 긴축 −1)', () => {
    const star = offer({ playerId: 0, clubId: 1 }); // 강태오 몸값 8, 실버 호크스 8
    expect(ev(star)).toEqual({ attract: -2, fee: 6 }); // 적합도 0 − 요구 2
    expect(ev(star, 'budget')).toBe('under-cost'); // 제시액 7
    expect(ev({ ...star, tactic: 'low' }, 'budget')).toMatchObject({ fee: 6 }); // 7 ≥ 8 − 3
    expect(ev(offer({ playerId: 0 }))).toBe('under-cost'); // 썬더 5 < 8
    expect(ev(offer({ playerId: 0, tactic: 'low' }))).toMatchObject({ fee: 6 }); // 5 ≥ 8 − 3
    expect(ev(offer({ playerId: 0, tactic: 'low' }), 'budget')).toBe('under-cost'); // 4 < 5
  });

  it('모든 결과는 정수', () => {
    for (const p of PLAYERS)
      for (const c of CLUBS)
        for (const demand of [1, 2, 3, 4] as const)
          for (const tactic of [null, 'charm', 'leak', 'fast', 'low', 'hijack'] as const)
            for (const e of ['normal', 'fw', 'budget', 'young', 'deadline'] as const) {
              const r = evaluateOffer({ playerId: p.id, clubId: c.id, demand, tactic }, e);
              if (typeof r === 'object') expect(Number.isInteger(r.attract) && Number.isInteger(r.fee) && r.fee >= 0).toBe(true);
            }
  });
});

describe('validateOffer', () => {
  it('시장에 없는 선수/구단, 판매된 선수', () => {
    expect(validateOffer(state(), 0, offer({ playerId: 2 }))).toBe('not-in-market');
    expect(validateOffer(state(), 0, offer({ clubId: 2 }))).toBe('not-in-market');
    expect(validateOffer(state({ sold: [3] }), 0, offer())).toBe('not-in-market');
  });

  it('보유하지 않은 카드', () => {
    const s = state({ agents: [agent({ demandUsed: [2, 2, 2], tactics: ['charm'] }), agent()] });
    expect(validateOffer(s, 0, offer())).toBe('card-not-owned');
    expect(validateOffer(s, 0, offer({ demand: 1, tactic: 'leak' }))).toBe('card-not-owned');
    expect(validateOffer(s, 0, offer({ demand: 1, tactic: 'charm' }))).toEqual({ attract: 4, fee: 3 });
  });
});

describe('resolveRound (1차)', () => {
  /** 1차만 제출 (2차 패스) */
  const resolve = (s: GameState, subs: Record<number, Submission>) =>
    resolveRound(s, Object.fromEntries(Object.entries(subs).map(([k, v]) => [k, { first: v, second: null }])));
  const entry = (s: GameState, i: number) => s.results.at(-1)!.entries.find((e) => e.agent === i && e.stage === 1)!;

  it('다른 선수면 모두 성사, 점수·계약·판매 반영', () => {
    const r = resolve(state(), { 0: offer(), 1: df });
    expect(r.phase).toBe('result');
    expect(r.agents.map((a) => [a.score, a.deals])).toEqual([[4, 1], [4, 1]]);
    expect(r.sold.sort()).toEqual([3, 6]);
    expect(entry(r, 0).status).toBe('won');
  });

  it('같은 선수: 매력도 높은 쪽 승리, 진 쪽도 카드 소모', () => {
    const r = resolve(state(), { 0: offer(), 1: offer({ tactic: 'charm' }) });
    expect(entry(r, 1)).toMatchObject({ status: 'won', attract: 3 });
    expect(entry(r, 0)).toMatchObject({ status: 'lost', winner: 1, winnerAttract: 3 });
    expect(r.agents[0]!.score).toBe(0);
    expect(r.agents[0]!.demandUsed).toEqual([2]);
  });

  it('욕심 vs 승률: 요구 수수료를 낮추면 이긴다', () => {
    const r = resolve(state(), { 0: offer({ demand: 4 }), 1: offer({ demand: 1 }) });
    expect(entry(r, 1)).toMatchObject({ status: 'won', fee: 3 });
    expect(entry(r, 0)).toMatchObject({ status: 'lost' });
  });

  it('매력도 동률이면 요구 수수료 낮은 쪽', () => {
    // A: 요구 1 → 매력도 2 / B: 요구 2 + 신속한 결단 → 매력도 2
    const r = resolve(state(), { 0: offer({ demand: 1 }), 1: offer({ tactic: 'fast' }) });
    expect(entry(r, 0).status).toBe('won');
    expect(entry(r, 1)).toMatchObject({ status: 'lost', winner: 0 });
  });

  it('동률 상쇄: 완전히 같은 최고 제안은 모두 탈락하고 다음 순위가 계약', () => {
    const r = resolve(state(), { 0: offer(), 1: offer() });
    expect([entry(r, 0), entry(r, 1)].map((e) => [e.status, e.tied])).toEqual([['lost', true], ['lost', true]]);
    expect(r.sold).toEqual([]);
    expect(r.agents.map((a) => a.demandUsed)).toEqual([[2], [2]]);

    const s3 = state({ agents: [agent(), agent(), agent()] });
    const r3 = resolve(s3, { 0: offer(), 1: offer(), 2: offer({ demand: 3 }) });
    expect(entry(r3, 2)).toMatchObject({ status: 'won', attract: 0, fee: 5 });
    expect(entry(r3, 0).tied).toBe(true);
  });

  it('관계 구축: 매력도·요구 수수료가 같으면 관계 구축을 낸 쪽이 이김, 둘 다 냈으면 상쇄', () => {
    // A 관계 구축 3 + 2 − 2 = 3 / B 실속 협상 3 + 2 − 2 = 3
    const r = resolve(state(), { 0: offer({ tactic: 'charm' }), 1: offer({ tactic: 'low' }) });
    expect(entry(r, 0)).toMatchObject({ status: 'won', attract: 3 });
    expect(entry(r, 1)).toMatchObject({ status: 'lost', winner: 0 });
    expect(entry(r, 1).tied).toBeUndefined();

    const r2 = resolve(state(), { 0: offer({ tactic: 'charm' }), 1: offer({ tactic: 'charm' }) });
    expect([entry(r2, 0).tied, entry(r2, 1).tied]).toEqual([true, true]);
  });

  it('카드 소모: 몸값 미달도 소모, 패스와 미보유 카드는 미소모', () => {
    const r = resolve(state({ market: [0, 3, 6] }), { 0: offer({ playerId: 0, tactic: 'fast' }), 1: null });
    expect(entry(r, 0)).toMatchObject({ status: 'invalid', reason: 'under-cost' });
    expect(r.agents[0]!.demandUsed).toEqual([2]);
    expect(r.agents[0]!.tactics).not.toContain('fast');
    expect(entry(r, 1).status).toBe('pass');
    expect(r.agents[1]!.demandUsed).toEqual([]);

    const s2 = state({ agents: [agent({ tactics: [] }), agent()] });
    const r2 = resolve(s2, { 0: offer({ tactic: 'charm' }), 1: null });
    expect(entry(r2, 0)).toMatchObject({ status: 'invalid', reason: 'card-not-owned' });
    expect(r2.agents[0]!.demandUsed).toEqual([]);
  });

  it('빅딜 시즌: 수수료가 가장 큰 계약에 +2 (동률이면 모두)', () => {
    const s = state({ event: 'deadline' });
    const r = resolve(s, { 0: offer(), 1: { ...df, demand: 3 } });
    expect(entry(r, 0).bigDeal).toBeUndefined();
    expect(entry(r, 1)).toMatchObject({ bigDeal: true, fee: 7 }); // 5 + 2
    const r2 = resolve(s, { 0: offer(), 1: df });
    expect([entry(r2, 0).fee, entry(r2, 1).fee]).toEqual([6, 6]);
  });

  it('사람 제출 누락 시 에러, 입찰 단계가 아니면 에러', () => {
    expect(() => resolveRound(state(), { 0: { first: null, second: null } })).toThrow();
    expect(() => resolve(state({ phase: 'result' }), { 0: null, 1: null })).toThrow();
  });

  it('상태를 변경하지 않는다', () => {
    const s = state();
    const snapshot = JSON.stringify(s);
    resolve(s, { 0: offer({ tactic: 'charm' }), 1: offer() });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('대어 쟁탈전 (1차는 대어만)', () => {
  it('대어 = 시장 몸값 상위 max(2, N − 1)명, 같으면 카드 번호 순, 판매된 선수 제외', () => {
    const s = state({ market: [6, 3, 1, 0] });
    expect(stars(s)).toEqual([0, 1]); // 2인: 2명 (몸값 8, 6)
    expect(stars({ ...s, agents: [agent(), agent(), agent(), agent()] })).toEqual([0, 1, 3]); // 4인: 3명
    expect(stars({ ...s, sold: [0] })).toEqual([1, 3]);
    // 몸값 2로 같은 정우진(6)·임재원(10) → 번호 작은 쪽
    expect(stars(state({ market: [10, 6, 13] }))).toEqual([6, 10]);
  });

  it('1차에 대어가 아닌 선수는 무효(카드 미소모), 2차에는 낼 수 있다', () => {
    const s = state({ market: [0, 1, 3, 6] }); // 대어: 강태오·윤시후
    expect(validateOffer(s, 0, offer())).toBe('not-star');
    expect(validateOffer(s, 0, offer(), 2)).toEqual({ attract: 1, fee: 4 });
    const r = resolveRound(s, { 0: { first: offer(), second: df }, 1: { first: null, second: null } });
    const es = r.results.at(-1)!.entries.filter((e) => e.agent === 0);
    expect(es.map((e) => [e.stage, e.status, e.reason])).toEqual([[1, 'invalid', 'not-star'], [2, 'won', undefined]]);
    expect(r.agents[0]!.demandUsed).toEqual([2]);
  });

  it('AI의 1차 제안은 항상 대어', () => {
    for (let seed = 0; seed < 100; seed++) {
      const g = createGame(Array.from({ length: 4 }, (_, i) => ({ name: `AI${i}`, kind: 'ai' as const, level: i % 2 ? ('easy' as const) : ('normal' as const) })), seed);
      const rng = createRng(seed);
      for (let i = 0; i < 4; i++) {
        const { first } = makeAiOffers(g, i, rng);
        if (first) expect(stars(g)).toContain(first.playerId);
      }
    }
  });
});

describe('1차·2차 협상과 하이재킹', () => {
  const pass: RoundSubmission = { first: null, second: null };
  const run = (s: GameState, subs: Record<number, RoundSubmission>) => resolveRound(s, subs);
  const one = (s: GameState, i: number, stage: 1 | 2) => {
    const es = s.results.at(-1)!.entries.filter((e) => e.agent === i && e.stage === stage);
    expect(es).toHaveLength(1);
    return es[0]!;
  };

  it('1차·2차 모두 성사', () => {
    const r = run(state(), { 0: { first: offer(), second: df }, 1: pass });
    expect(one(r, 0, 1)).toMatchObject({ status: 'won', fee: 4 });
    expect(one(r, 0, 2)).toMatchObject({ status: 'won', fee: 4 });
    expect(r.agents[0]).toMatchObject({ score: 8, deals: 2, demandUsed: [2, 2] });
    expect(one(r, 1, 1).status).toBe('pass');
    expect(one(r, 1, 2).status).toBe('pass');
  });

  it('2차 선수가 1차에서 계약되면 협상 무산, 공개된 카드는 버림', () => {
    const r = run(state(), { 0: { first: offer(), second: null }, 1: { first: df, second: offer({ demand: 3, tactic: 'leak' }) } });
    expect(one(r, 1, 2)).toMatchObject({ status: 'void' });
    expect(r.agents[1]!.demandUsed).toEqual([2, 3]);
    expect(r.agents[1]!.tactics).not.toContain('leak');
    expect(r.agents[0]!.score).toBe(4);
  });

  it('1차·2차 선수/구단 중복은 2차 무효, 카드 미소모', () => {
    const r = run(state(), { 0: { first: offer(), second: offer({ clubId: 0, demand: 1 }) }, 1: pass });
    expect(one(r, 0, 2)).toMatchObject({ status: 'invalid', reason: 'duplicate' });
    const r2 = run(state(), { 0: { first: offer(), second: offer({ playerId: 6, demand: 1 }) }, 1: pass });
    expect(one(r2, 0, 2)).toMatchObject({ status: 'invalid', reason: 'duplicate' });
    expect(r2.agents[0]!.demandUsed).toEqual([2]);
  });

  it('1차와 2차가 카드를 나눠 쓴다', () => {
    const s = state({ agents: [agent({ demandUsed: [2, 2] }), agent()] });
    expect(validateOffer(s, 0, df, 2, offer())).toBe('card-not-owned');
    expect(validateOffer(s, 0, { ...df, demand: 1 }, 2, offer())).toEqual({ attract: 1, fee: 3 });
    // 1차가 무효(시장 밖)면 카드가 소모되지 않으므로 2차에서 쓸 수 있다
    expect(validateOffer(s, 0, df, 2, offer({ playerId: 2 }))).toEqual({ attract: 0, fee: 4 });
    const r = run(s, { 0: { first: offer(), second: df }, 1: pass });
    expect(one(r, 0, 2)).toMatchObject({ status: 'invalid', reason: 'card-not-owned' });
  });

  it('하이재킹은 2차 전용', () => {
    expect(validateOffer(state(), 0, offer({ tactic: 'hijack' }))).toBe('second-only');
    const r = run(state(), { 0: { first: offer({ tactic: 'hijack' }), second: null }, 1: pass });
    expect(one(r, 0, 1)).toMatchObject({ status: 'invalid', reason: 'second-only' });
    expect(r.agents[0]!.demandUsed).toEqual([]);
  });

  it('하이재킹 성공: 1차 계약 매력도 이상이면 계약을 빼앗는다', () => {
    // 1차: A 매력도 1. 2차: B 하이재킹 요구 2 → 3 + 3 − 2 = 4
    const r = run(state(), { 0: { first: offer(), second: null }, 1: { first: df, second: offer({ tactic: 'hijack' }) } });
    expect(one(r, 0, 1)).toMatchObject({ status: 'hijacked', by: 1, attract: 1 });
    expect(one(r, 1, 2)).toMatchObject({ status: 'won', hijack: true, attract: 4, fee: 4 });
    expect(r.agents[0]).toMatchObject({ score: 0, deals: 0, demandUsed: [2] });
    expect(r.agents[1]).toMatchObject({ score: 8, deals: 2 });
    expect(r.agents[1]!.tactics).not.toContain('hijack');
    expect(r.sold.filter((id) => id === 3)).toHaveLength(1);
  });

  it('하이재킹은 매력도가 같아도 성공', () => {
    // 1차: A 요구 1 → 매력도 2. 2차: B 하이재킹 요구 4 → 3 + 3 − 4 = 2 (동률)
    const r = run(state(), { 0: { first: offer({ demand: 1 }), second: null }, 1: { first: null, second: offer({ demand: 4, tactic: 'hijack' }) } });
    expect(one(r, 0, 1).status).toBe('hijacked');
    expect(one(r, 1, 2)).toMatchObject({ status: 'won', hijack: true, fee: 6 });
  });

  it('하이재킹 실패: 매력도가 낮으면 1차 계약 유지, 카드 소모', () => {
    // 1차: A 이적설 흘리기 요구 1 → 3 + 4 − 1 = 6. 2차: B 하이재킹 요구 1 → 5
    const r = run(state(), {
      0: { first: offer({ demand: 1, tactic: 'leak' }), second: null },
      1: { first: null, second: offer({ demand: 1, tactic: 'hijack' }) },
    });
    expect(one(r, 0, 1)).toMatchObject({ status: 'won', fee: 2 });
    expect(one(r, 1, 2)).toMatchObject({ status: 'lost', winner: 0, winnerAttract: 6, hijackFailed: true });
    expect(r.agents[1]).toMatchObject({ score: 0, demandUsed: [1] });
    expect(r.agents[1]!.tactics).not.toContain('hijack');
  });

  it('하이재커끼리 먼저 경쟁하고(동률이면 상쇄), 대표가 1차 계약과 비교된다', () => {
    const s = state({ agents: [agent(), agent(), agent()] });
    const r = run(s, {
      0: { first: offer(), second: null },
      1: { first: null, second: offer({ demand: 1, tactic: 'hijack' }) }, // 5
      2: { first: null, second: offer({ tactic: 'hijack' }) }, // 4
    });
    expect(one(r, 0, 1)).toMatchObject({ status: 'hijacked', by: 1 });
    expect(one(r, 1, 2)).toMatchObject({ status: 'won', hijack: true });
    expect(one(r, 2, 2)).toMatchObject({ status: 'lost', winner: 1, winnerAttract: 5 });

    const r2 = run(s, {
      0: { first: offer(), second: null },
      1: { first: null, second: offer({ demand: 1, tactic: 'hijack' }) },
      2: { first: null, second: offer({ demand: 1, tactic: 'hijack' }) },
    });
    expect(one(r2, 0, 1).status).toBe('won');
    expect([one(r2, 1, 2).tied, one(r2, 2, 2).tied]).toEqual([true, true]);
  });

  it('1차에 계약되지 않은 선수에게 쓴 하이재킹은 일반 2차 제안 (+3)', () => {
    const r = run(state(), { 0: { first: null, second: offer({ tactic: 'hijack' }) }, 1: { first: null, second: offer({ tactic: 'leak' }) } });
    expect(one(r, 1, 2)).toMatchObject({ status: 'won', attract: 5 });
    expect(one(r, 0, 2)).toMatchObject({ status: 'lost', winner: 1 });
    expect(one(r, 1, 2).hijack).toBeUndefined();
  });

  it('빅딜 시즌은 1차·2차 최종 계약 전체에서 판정하고, 하이재킹된 계약은 제외', () => {
    const s = state({ event: 'deadline' });
    const r = run(s, { 0: { first: df, second: offer({ demand: 4 }) }, 1: pass });
    expect(one(r, 0, 1).bigDeal).toBeUndefined();
    expect(one(r, 0, 2)).toMatchObject({ bigDeal: true, fee: 8 });

    // A 1차 윤시후 요구 4 (수수료 7, 최고) → B가 하이재킹 요구 3 (수수료 6)으로 탈취 → 빼앗긴 7은 빠지고 B의 6이 최고
    const mf = offer({ playerId: 1, clubId: 1, demand: 4 });
    const s2 = state({ event: 'deadline', market: [1, 3, 6] }); // 대어: 윤시후·최준서
    const r2 = run(s2, { 0: { first: mf, second: df }, 1: { first: null, second: { ...mf, demand: 3, tactic: 'hijack' } } });
    expect(one(r2, 0, 1).status).toBe('hijacked');
    expect(one(r2, 1, 2)).toMatchObject({ status: 'won', bigDeal: true, fee: 8 });
    expect(one(r2, 0, 2)).toMatchObject({ status: 'won', fee: 4 });
    expect(one(r2, 0, 2).bigDeal).toBeUndefined();
  });

  it('보통 AI는 하이재킹을 시도하고, 실제로 성공하는 경우가 있다', () => {
    let tries = 0;
    let success = 0;
    for (let seed = 0; seed < 100; seed++) {
      let g = createGame(Array.from({ length: 4 }, (_, i) => ({ name: `AI${i}`, kind: 'ai' as const, level: 'normal' as const })), seed);
      while (g.phase !== 'done') g = nextRound(resolveRound(g, {}));
      for (const r of g.results)
        for (const e of r.entries) {
          if (e.offer?.tactic === 'hijack') tries++;
          if (e.status === 'hijacked') success++;
        }
    }
    expect(tries).toBeGreaterThan(0);
    expect(success).toBeGreaterThan(0);
  });
});

describe('AI', () => {
  it.each(['easy', 'normal'] as const)('항상 유효한 제안 또는 null (%s)', (level) => {
    for (let seed = 0; seed < 300; seed++) {
      const g = createGame([{ name: 'A', kind: 'ai', level }, { name: 'B', kind: 'ai', level }, { name: 'C', kind: 'ai', level }], seed);
      const rng = createRng(seed);
      for (let i = 0; i < 3; i++) {
        const { first, second } = makeAiOffers(g, i, rng);
        if (first) {
          expect(typeof validateOffer(g, i, first)).toBe('object');
          expect(first.tactic).not.toBe('hijack');
        }
        if (second) expect(typeof validateOffer(g, i, second, 2, first)).toBe('object');
        if (first && second) {
          expect(second.playerId).not.toBe(first.playerId);
          expect(second.clubId).not.toBe(first.clubId);
        }
      }
    }
  });

  it('난이도 미지정 AI는 easy, 사람에게는 난이도 없음', () => {
    const g = createGame([{ name: 'A', kind: 'human' }, { name: 'B', kind: 'ai' }, { name: 'C', kind: 'ai', level: 'normal' }], 1);
    expect(g.agents.map((a) => a.level)).toEqual([undefined, 'easy', 'normal']);
  });

  it('보통 AI: 남은 카드·판매된 선수를 지키고, 시장이 비면 null', () => {
    const s = state({
      agents: [agent({ kind: 'ai', level: 'normal', demandUsed: [1, 1, 1, 2, 2, 2, 3, 3, 3], tactics: ['charm'] }), agent()],
      market: [0, 1, 3, 6],
      sold: [0, 1],
    });
    for (let seed = 0; seed < 50; seed++) {
      const o = makeAiOffer(s, 0, createRng(seed))!;
      expect(o.demand).toBe(4);
      expect([3, 6]).toContain(o.playerId);
      expect(typeof validateOffer(s, 0, o)).toBe('object');
    }
    expect(makeAiOffer(state({ sold: [0, 1, 3, 6], agents: [agent({ kind: 'ai', level: 'normal' })] }), 0, createRng(1))).toBeNull();
  });

  it('보통 AI가 쉬움 AI보다 평균 수수료가 높다', () => {
    let normal = 0;
    let easy = 0;
    for (let seed = 0; seed < 200; seed++) {
      const lv = seed % 2 === 0 ? (['normal', 'easy'] as const) : (['easy', 'normal'] as const);
      let g = createGame(lv.map((level, i) => ({ name: `AI${i}`, kind: 'ai' as const, level })), seed);
      while (g.phase !== 'done') g = nextRound(resolveRound(g, {}));
      g.agents.forEach((a) => (a.level === 'normal' ? (normal += a.score) : (easy += a.score)));
    }
    expect(normal).toBeGreaterThan(easy * 1.1);
  });
});

describe('게임 진행', () => {
  const play = (seed: number, n = 4) => {
    let g = createGame(Array.from({ length: n }, (_, i) => ({ name: `AI${i}`, kind: 'ai' as const })), seed);
    while (g.phase !== 'done') g = nextRound(resolveRound(g, {}));
    return g;
  };

  it('createGame: 카드 지급과 첫 시장', () => {
    const g = createGame([{ name: 'A', kind: 'human' }, { name: 'B', kind: 'ai' }], 7);
    expect(g.round).toBe(1);
    expect(g.phase).toBe('bid');
    // 2명: 선수 2N+1 = 5, 구단 N+2 = 4
    expect(g.market).toHaveLength(5);
    expect(g.clubs).toHaveLength(4);
    const g4 = createGame(Array.from({ length: 4 }, (_, i) => ({ name: `P${i}`, kind: 'ai' as const })), 7);
    expect([g4.market.length, g4.clubs.length]).toEqual([9, 6]);
    for (const a of g.agents) {
      expect(a.tactics).toHaveLength(4);
      expect(new Set(a.tactics).size).toBe(4);
      expect(a.tactics.at(-1)).toBe('hijack');
      expect(demandRemaining(a)).toEqual({ 1: 3, 2: 3, 3: 3, 4: 3 });
    }
    expect(() => createGame([{ name: 'A', kind: 'human' }], 1)).toThrow();
  });

  it('5라운드 후 종료, 판매된 선수는 다시 나오지 않음, 점수는 정수', () => {
    for (let seed = 0; seed < 50; seed++) {
      const g = play(seed);
      expect(g.results).toHaveLength(TOTAL_ROUNDS);
      expect(new Set(g.sold).size).toBe(g.sold.length);
      expect(g.agents.reduce((s, a) => s + a.deals, 0)).toBe(g.sold.length);
      for (const a of g.agents) {
        expect(a.demandUsed.length).toBeLessThanOrEqual(TOTAL_ROUNDS * 2);
        expect(Number.isInteger(a.score)).toBe(true);
      }
      g.results.forEach((r, i) => {
        const soldBefore = new Set(g.results.slice(0, i).flatMap((x) => x.entries.filter((e) => e.status === 'won').map((e) => e.offer!.playerId)));
        for (const e of r.entries) if (e.offer && e.status !== 'invalid') expect(soldBefore.has(e.offer.playerId)).toBe(false);
        // 라운드 안에서 한 선수는 최종적으로 한 번만 계약
        const won = r.entries.filter((e) => e.status === 'won').map((e) => e.offer!.playerId);
        expect(new Set(won).size).toBe(won.length);
      });
    }
  });

  it('같은 시드는 같은 게임', () => {
    expect(play(123)).toEqual(play(123));
  });

  it('JSON 직렬화 왕복 후에도 동일하게 진행', () => {
    const g = createGame([{ name: 'A', kind: 'ai' }, { name: 'B', kind: 'ai' }], 99);
    const copy = JSON.parse(JSON.stringify(g)) as GameState;
    expect(resolveRound(copy, {})).toEqual(resolveRound(g, {}));
  });

  it('rankings: 동점은 같은 순위', () => {
    const s = state({ agents: [agent({ score: 2 }), agent({ score: 3 }), agent({ score: 2 })] });
    expect(rankings(s)).toEqual([
      { agent: 1, rank: 1, score: 3 },
      { agent: 0, rank: 2, score: 2 },
      { agent: 2, rank: 2, score: 2 },
    ]);
  });

  it('데이터 무결성', () => {
    expect(PLAYERS).toHaveLength(36);
    expect(CLUBS).toHaveLength(12);
    const maxBudget = Math.max(...CLUBS.map((c) => c.budget));
    for (const p of PLAYERS) {
      expect(p.cost).toBeLessThanOrEqual(maxBudget);
      expect(p.base).toBe(Math.max(2, Math.ceil(p.cost / 2)));
    }
  });
});

describe('의뢰 선수 등록', () => {
  const setup = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, kind: 'ai' as const }));

  it('시장 = 등록한 의뢰 선수 N장 + 덱 N+1장, 손패는 2장으로 보충', () => {
    for (const n of [2, 3, 4]) {
      const g = createGame(setup(n), 7);
      expect(g.market).toHaveLength(marketSize(n).players);
      for (const a of g.agents) {
        expect(a.clients).toEqual([{ playerId: expect.any(Number), round: 1 }]);
        expect(g.market).toContain(a.clients[0]!.playerId);
        expect(a.hand).toHaveLength(2);
        for (const id of a.hand) expect(g.market).not.toContain(id);
      }
      const hands = g.agents.flatMap((a) => a.hand);
      expect(new Set(hands).size).toBe(hands.length);
    }
  });

  it('제출한 다음 라운드 의뢰를 등록하고, 예고된 이벤트를 적용', () => {
    const g = createGame(setup(2), 3);
    const pick = g.agents[0]!.hand[1]!;
    const s = state({
      ...g,
      phase: 'result',
      agents: g.agents.map((a, i) => (i === 0 ? { ...a, pending: pick } : a)),
      nextEvent: 'young',
    });
    const next = dealRound({ ...s, round: 2 });
    expect(next.event).toBe('young');
    expect(next.agents[0]!.clients.at(-1)).toEqual({ playerId: pick, round: 2 });
    expect(next.agents[0]!.hand).not.toContain(pick);
    expect(next.market).toContain(pick);
  });

  it('resolveRound: 손패에 없는 카드는 등록 예약하지 않음', () => {
    const s = state({ agents: [agent({ hand: [10, 11] }), agent({ hand: [12, 13] })] });
    const r = resolveRound(s, { 0: { first: null, second: null, client: 11 }, 1: { first: null, second: null, client: 99 } });
    expect(r.agents[0]!.pending).toBe(11);
    expect(r.agents[1]!.pending).toBeNull();
  });

  it('보너스: 다른 에이전트가 계약하면 기본 수수료, 직접 계약·미계약은 0, 등록 라운드만 인정', () => {
    // 0번이 최준서(기본 2)를 1라운드에 등록, 1번이 계약 / 1번이 정우진을 등록하고 직접 계약
    const s = state({
      agents: [agent({ clients: [{ playerId: 3, round: 1 }, { playerId: 0, round: 2 }] }), agent({ clients: [{ playerId: 6, round: 1 }] })],
    });
    const r = resolveRound(s, { 0: { first: null, second: null }, 1: { first: offer(), second: df } });
    expect(clientOutcomes(r, 0)).toEqual([
      { playerId: 3, round: 1, result: 'other', by: 1, bonus: 2 },
      { playerId: 0, round: 2, result: 'unsigned', bonus: 0 },
    ]);
    expect(clientOutcomes(r, 1)).toEqual([{ playerId: 6, round: 1, result: 'self', by: 1, bonus: 0 }]);
  });

  it('게임 종료 시 의뢰 보너스를 점수에 더함', () => {
    const s = state({
      round: TOTAL_ROUNDS,
      agents: [agent({ clients: [{ playerId: 3, round: 1 }] }), agent()],
    });
    const r = resolveRound({ ...s, round: 1 }, { 0: { first: null, second: null }, 1: { first: offer(), second: null } });
    const done = nextRound({ ...r, round: TOTAL_ROUNDS });
    expect(done.phase).toBe('done');
    expect(done.agents[0]!.clientBonus).toBe(2);
    expect(done.agents[0]!.score).toBe(2);
    expect(done.agents[1]!.score).toBe(r.agents[1]!.score);
  });
});
