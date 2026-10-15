import { describe, expect, it } from 'vitest';
import {
  CLUBS,
  PLAYERS,
  TOTAL_ROUNDS,
  createGame,
  createRng,
  evaluateOffer,
  feeRemaining,
  makeAiOffer,
  nextRound,
  rankings,
  resolveRound,
  validateOffer,
} from './index';
import type { AgentState, EventKey, GameState, Offer, Submission } from './types';

// 선수: 0 강태오 FW 최소8 스타 +1 / 3 최준서 FW 최소3 유망주 +1 / 6 정우진 DF 최소2 멀티 +0.3 / 1 윤시후 MF 최소6 플메 +0
// 구단: 0 블루 드래곤즈 10 FW 스타 / 6 썬더 울브스 5 FW 유망주 / 5 노바 크루저스 6 DF 베테랑 / 1 실버 호크스 8 MF 플메

const agent = (over: Partial<AgentState> = {}): AgentState => ({
  name: 'A', kind: 'human', score: 0, deals: 0, feeUsed: [], tactics: ['charm', 'leak', 'fast', 'low'], ...over,
});

const state = (over: Partial<GameState> = {}): GameState => ({
  v: 1, rng: 1, round: 1, phase: 'bid', event: 'normal',
  market: [0, 1, 3, 6], clubs: [0, 1, 5, 6], sold: [],
  agents: [agent({ name: 'A' }), agent({ name: 'B' })],
  results: [],
  ...over,
});

const offer = (over: Partial<Offer> = {}): Offer => ({ playerId: 3, clubId: 6, salary: 4, fee: 10, tactic: null, ...over });
const ev = (o: Offer, e: EventKey = 'normal') => evaluateOffer(o, e);

describe('evaluateOffer', () => {
  it('기본: 연봉 + 포지션 일치 + 선호 특성, 수수료 = 연봉×율 + 보너스', () => {
    // 최준서(FW 유망주) → 썬더 울브스(FW 유망주): 4 + 2 + 1
    expect(ev(offer())).toEqual({ salary: 4, attract: 7, fee: 1.4 });
  });

  it('포지션/특성 불일치면 가산 없음', () => {
    // 정우진(DF 멀티) → 실버 호크스(MF 플메)
    expect(ev(offer({ playerId: 6, clubId: 1, salary: 5, fee: 20 }))).toEqual({ salary: 5, attract: 5, fee: 1.3 });
  });

  it('전략 카드 효과', () => {
    expect(ev(offer({ tactic: 'charm' }))).toMatchObject({ attract: 9, fee: 1.4 });
    expect(ev(offer({ tactic: 'leak' }))).toMatchObject({ attract: 10, fee: 1.2 });
    expect(ev(offer({ tactic: 'fast' }))).toMatchObject({ attract: 8, fee: 1.7 });
    // 실속 협상: 유효 연봉 3, 매력도 3+2+1+1
    expect(ev(offer({ tactic: 'low' }))).toEqual({ salary: 3, attract: 7, fee: 1.3 });
  });

  it('이벤트 효과', () => {
    expect(ev(offer(), 'fw')).toMatchObject({ attract: 8 });
    expect(ev(offer({ playerId: 6, clubId: 5, salary: 3 }), 'fw')).toMatchObject({ attract: 5 }); // DF는 해당 없음
    expect(ev(offer(), 'young')).toMatchObject({ fee: 1.7 });
    expect(ev(offer({ playerId: 6, clubId: 5, salary: 3 }), 'young')).toMatchObject({ fee: 0.6 });
  });

  it('연봉 경계값', () => {
    expect(ev(offer({ salary: 3 }))).toMatchObject({ salary: 3 }); // = 최소 연봉
    expect(ev(offer({ salary: 2 }))).toBe('salary-below-min');
    expect(ev(offer({ salary: 5 }))).toMatchObject({ salary: 5 }); // = 예산
    expect(ev(offer({ salary: 6 }))).toBe('over-budget');
    expect(ev(offer({ salary: 5 }), 'budget')).toBe('over-budget'); // 긴축: 예산 4
    expect(ev(offer({ salary: 3, tactic: 'low' }))).toBe('salary-below-min'); // 실속으로 2가 됨
    expect(ev(offer({ salary: 6, tactic: 'low' }))).toMatchObject({ salary: 5 }); // 실속으로 예산 안에 들어옴
  });

  it('수수료 하한 0', () => {
    // 윤시후 보너스 0, 연봉 6 × 5% = 0.3 - 0.2 = 0.1 → 하한 테스트용으로 0 이상 유지
    expect(ev(offer({ playerId: 1, clubId: 1, salary: 6, fee: 5, tactic: 'leak' }))).toMatchObject({ fee: 0.1 });
  });
});

describe('validateOffer', () => {
  it('시장에 없는 선수/구단, 판매된 선수', () => {
    expect(validateOffer(state(), 0, offer({ playerId: 2 }))).toBe('not-in-market');
    expect(validateOffer(state(), 0, offer({ clubId: 2 }))).toBe('not-in-market');
    expect(validateOffer(state({ sold: [3] }), 0, offer())).toBe('not-in-market');
  });

  it('보유하지 않은 카드', () => {
    const s = state({ agents: [agent({ feeUsed: [10, 10], tactics: ['charm'] }), agent()] });
    expect(validateOffer(s, 0, offer({ fee: 10 }))).toBe('card-not-owned');
    expect(validateOffer(s, 0, offer({ fee: 5, tactic: 'leak' }))).toBe('card-not-owned');
    expect(validateOffer(s, 0, offer({ fee: 5, tactic: 'charm' }))).toMatchObject({ attract: 9 });
  });
});

describe('resolveRound', () => {
  const resolve = (s: GameState, subs: Record<number, Submission>) => resolveRound(s, subs);
  const entry = (s: GameState, i: number) => s.results.at(-1)!.entries.find((e) => e.agent === i)!;

  it('다른 선수면 모두 성사, 점수·계약·판매 반영', () => {
    const r = resolve(state(), { 0: offer(), 1: offer({ playerId: 6, clubId: 5, salary: 3 }) });
    expect(r.phase).toBe('result');
    expect(r.agents.map((a) => [a.score, a.deals])).toEqual([[1.4, 1], [0.6, 1]]);
    expect(r.sold.sort()).toEqual([3, 6]);
    expect(entry(r, 0).status).toBe('won');
  });

  it('같은 선수: 매력도 높은 쪽 승리', () => {
    const r = resolve(state(), { 0: offer(), 1: offer({ tactic: 'charm' }) });
    expect(entry(r, 1)).toMatchObject({ status: 'won', attract: 9 });
    expect(entry(r, 0)).toMatchObject({ status: 'lost', winner: 1, winnerAttract: 9 });
    expect(r.agents[0]!.score).toBe(0);
    // 진 쪽도 카드는 소모
    expect(r.agents[0]!.feeUsed).toEqual([10]);
  });

  it('매력도 동률이면 수수료율 낮은 쪽', () => {
    const r = resolve(state(), { 0: offer({ fee: 20 }), 1: offer({ fee: 5 }) });
    expect(entry(r, 1).status).toBe('won');
  });

  it('완전 동률은 시드에 따라 결정되고 재현 가능', () => {
    const s = state();
    const a = resolve(s, { 0: offer(), 1: offer() });
    const b = resolve(s, { 0: offer(), 1: offer() });
    expect(a).toEqual(b);
    const winnersBySeed = new Set(
      Array.from({ length: 20 }, (_, seed) => entry(resolve(state({ rng: seed }), { 0: offer(), 1: offer() }), 0).status),
    );
    expect(winnersBySeed).toEqual(new Set(['won', 'lost']));
  });

  it('카드 소모: 무효 제출도 소모, 패스와 미보유 카드는 미소모', () => {
    const r = resolve(state(), { 0: offer({ salary: 9, tactic: 'fast' }), 1: null });
    expect(entry(r, 0)).toMatchObject({ status: 'invalid', reason: 'over-budget' });
    expect(r.agents[0]!.feeUsed).toEqual([10]);
    expect(r.agents[0]!.tactics).not.toContain('fast');
    expect(entry(r, 1).status).toBe('pass');
    expect(r.agents[1]!.feeUsed).toEqual([]);

    const s2 = state({ agents: [agent({ tactics: [] }), agent()] });
    const r2 = resolve(s2, { 0: offer({ tactic: 'charm' }), 1: null });
    expect(entry(r2, 0)).toMatchObject({ status: 'invalid', reason: 'card-not-owned' });
    expect(r2.agents[0]!.feeUsed).toEqual([]);
  });

  it('빅딜 시즌: 최고 연봉 계약에 +0.5 (동률이면 모두)', () => {
    const s = state({ event: 'deadline', agents: [agent(), agent(), agent()] });
    const r = resolve(s, {
      0: offer({ salary: 5 }), // 최준서 5억
      1: offer({ playerId: 6, clubId: 5, salary: 6, tactic: 'low' }), // 정우진 유효 5억
      2: null,
    });
    expect([0, 1].map((i) => entry(r, i).bigDeal)).toEqual([true, true]);
    expect(entry(r, 0).fee).toBe(2); // 0.5 + 1 + 0.5

    const r2 = resolve(s, { 0: offer({ salary: 5 }), 1: offer({ playerId: 6, clubId: 5, salary: 5 }), 2: offer({ playerId: 1, clubId: 1, salary: 6 }) });
    expect(entry(r2, 0).bigDeal).toBeUndefined();
    expect(entry(r2, 1).bigDeal).toBeUndefined();
    expect(entry(r2, 2)).toMatchObject({ bigDeal: true, fee: 1.1 }); // 6×10% + 0 + 0.5
  });

  it('사람 제출 누락 시 에러, 입찰 단계가 아니면 에러', () => {
    expect(() => resolve(state(), { 0: null })).toThrow();
    expect(() => resolve(state({ phase: 'result' }), { 0: null, 1: null })).toThrow();
  });

  it('상태를 변경하지 않는다', () => {
    const s = state();
    const snapshot = JSON.stringify(s);
    resolve(s, { 0: offer({ tactic: 'charm' }), 1: offer() });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

describe('AI', () => {
  it('항상 유효한 제안 또는 null', () => {
    for (let seed = 0; seed < 300; seed++) {
      const g = createGame([{ name: 'A', kind: 'ai' }, { name: 'B', kind: 'ai' }, { name: 'C', kind: 'ai' }], seed);
      const rng = createRng(seed);
      for (let i = 0; i < 3; i++) {
        const o = makeAiOffer(g, i, rng);
        if (o) expect(typeof validateOffer(g, i, o)).toBe('object');
      }
    }
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
    expect(g.market).toHaveLength(3);
    expect(g.clubs).toHaveLength(3);
    for (const a of g.agents) {
      expect(a.tactics).toHaveLength(3);
      expect(new Set(a.tactics).size).toBe(3);
      expect(feeRemaining(a)).toEqual({ 5: 2, 10: 2, 15: 2, 20: 2 });
    }
    expect(() => createGame([{ name: 'A', kind: 'human' }], 1)).toThrow();
  });

  it('5라운드 후 종료, 판매된 선수는 다시 나오지 않음', () => {
    for (let seed = 0; seed < 50; seed++) {
      const g = play(seed);
      expect(g.results).toHaveLength(TOTAL_ROUNDS);
      expect(new Set(g.sold).size).toBe(g.sold.length);
      expect(g.agents.reduce((s, a) => s + a.deals, 0)).toBe(g.sold.length);
      for (const a of g.agents) expect(a.feeUsed.length).toBeLessThanOrEqual(TOTAL_ROUNDS);
      g.results.forEach((r, i) => {
        const soldBefore = new Set(g.results.slice(0, i).flatMap((x) => x.entries.filter((e) => e.status === 'won').map((e) => e.offer!.playerId)));
        for (const e of r.entries) if (e.offer && e.status !== 'invalid') expect(soldBefore.has(e.offer.playerId)).toBe(false);
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
    expect(PLAYERS).toHaveLength(20);
    expect(CLUBS).toHaveLength(8);
    for (const p of PLAYERS) expect(p.minSalary).toBeLessThanOrEqual(10);
  });
});
