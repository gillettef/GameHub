import { describe, expect, it } from 'vitest';
import {
  CLUBS_IN_GAME,
  CLUB_BONUS,
  GUESS_BONUS,
  PLAYERS,
  TOTAL_ROUNDS,
  clubMarks,
  clubWeight,
  contest,
  createGame,
  createRng,
  currentEvent,
  dealRound,
  evaluateOffer,
  evidence,
  finishGame,
  makeAiGuesses,
  makeAiOffer,
  marketSize,
  nextRound,
  playCard,
  rankings,
  resolveRound,
  upcomingEvent,
  validateOffer,
  winners,
} from './index';
import type { AgentState, EventKey, GameState, Offer } from './types';

// 선수: 0 강태오 FW 몸값8 스타 기본4 / 1 윤시후 MF 몸값6 플메 기본3 / 3 최준서 FW 몸값3 유망주 기본2 / 6 정우진 DF 몸값2 멀티 기본2
// 구단: 0 블루 드래곤즈 10 FW 스타 / 1 실버 호크스 8 MF 플메 / 5 노바 크루저스 6 DF 베테랑 / 6 썬더 울브스 5 FW 유망주

const agent = (over: Partial<AgentState> = {}): AgentState => ({ name: 'A', kind: 'human', score: 0, deals: 0, hand: [1, 2, 3, 4], secret: 0, ...over });

const state = (over: Partial<GameState> = {}): GameState => ({
  v: 5,
  rng: 1,
  round: 1,
  phase: 'bid',
  events: ['normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'deadline'],
  market: [0, 3, 6],
  clubs: [0, 1, 5, 6],
  signings: [],
  agents: [agent({ name: 'A', secret: 0 }), agent({ name: 'B', secret: 1 })],
  results: [],
  ...over,
});

/** 최준서 → 썬더 울브스, 요구 2: 매력도 3 − 2 = 1, 수수료 2 + 2 = 4 */
const offer = (over: Partial<Offer> = {}): Offer => ({ playerId: 3, clubId: 6, demand: 2, ...over });
const ev = (o: Offer, e: EventKey = 'normal') => evaluateOffer(o, e);
const withEvent = (e: EventKey) => state({ events: [e, 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'deadline'] });

describe('evaluateOffer (정수 계산)', () => {
  it('매력도 = 적합도 − 요구 수수료, 수수료 = 기본 + 요구 수수료', () => {
    expect(ev(offer())).toEqual({ attract: 1, fee: 4 });
    expect(ev(offer({ demand: 4 }))).toEqual({ attract: -1, fee: 6 });
    // 정우진(DF 멀티) → 실버 호크스(MF 플메): 적합 0
    expect(ev(offer({ playerId: 6, clubId: 1, demand: 1 }))).toEqual({ attract: -1, fee: 3 });
  });

  it('제시액이 몸값보다 낮으면 몸값 미달', () => {
    // 강태오 몸값 8 → 썬더 울브스 제시액 5
    expect(ev(offer({ playerId: 0, clubId: 6 }))).toBe('under-cost');
  });

  it('이벤트: 수수료 +2 (공격수 품귀·유망주 열풍·수비 보강·빅딜 시즌·데드라인 데이)', () => {
    expect(ev(offer(), 'fw')).toEqual({ attract: 1, fee: 6 });
    expect(ev(offer(), 'young')).toEqual({ attract: 1, fee: 6 });
    expect(ev(offer(), 'defense')).toEqual({ attract: 1, fee: 4 });
    expect(ev(offer({ playerId: 6, clubId: 5 }), 'defense')).toEqual({ attract: 0, fee: 6 });
    expect(ev(offer(), 'big')).toEqual({ attract: 1, fee: 4 });
    expect(ev(offer({ playerId: 0, clubId: 0 }), 'big')).toEqual({ attract: 1, fee: 8 });
    expect(ev(offer(), 'deadline')).toEqual({ attract: 1, fee: 6 });
  });

  it('구단 긴축: 제시액 −2', () => {
    // 최준서 몸값 3 → 썬더 울브스 5 − 2 = 3 (가능), 강태오 8 → 블루 드래곤즈 10 − 2 = 8 (가능)
    expect(ev(offer(), 'budget')).toEqual({ attract: 1, fee: 4 });
    expect(ev(offer({ playerId: 1, clubId: 6 }), 'budget')).toBe('under-cost');
  });
});

describe('요구 수수료 카드 순환', () => {
  it('낸 카드는 손에서 빠지고, 4장을 모두 쓰면 1~4를 다시 가져온다', () => {
    expect(playCard([1, 2, 3, 4], 3)).toEqual([1, 2, 4]);
    expect(playCard([4], 4)).toEqual([1, 2, 3, 4]);
  });
  it('손에 없는 카드는 낼 수 없다', () => {
    const s = state({ agents: [agent({ hand: [1, 3] }), agent()] });
    expect(validateOffer(s, 0, offer({ demand: 2 }))).toBe('card-not-owned');
    expect(validateOffer(s, 0, offer({ demand: 3 }))).toEqual({ attract: 0, fee: 5 });
  });
});

describe('contest (경쟁 판정)', () => {
  const c = (agent: number, attract: number) => ({ agent, offer: offer(), attract, fee: 4 });
  it('매력도가 가장 높은 제안이 계약', () => {
    const r = contest([c(0, 1), c(1, 2)]);
    expect(r.winner?.agent).toBe(1);
    expect(r.beaten.map((x) => x.agent)).toEqual([0]);
  });
  it('최고 매력도가 같으면 서로 상쇄되고 다음 순위가 계약', () => {
    const r = contest([c(0, 2), c(1, 2), c(2, 0)]);
    expect(r.winner?.agent).toBe(2);
    expect(r.cancelled.map((x) => x.agent).sort()).toEqual([0, 1]);
  });
  it('모두 동률이면 계약 없음', () => {
    expect(contest([c(0, 1), c(1, 1)]).winner).toBeNull();
  });
});

describe('resolveRound', () => {
  it('서로 다른 선수 제안은 모두 성사, 계약 선수는 시장에서 빠지고 구단 아래 놓인다', () => {
    const s = resolveRound(state(), { 0: offer(), 1: offer({ playerId: 6, clubId: 5, demand: 1 }) });
    expect(s.agents.map((a) => a.score)).toEqual([4, 3]);
    expect(s.market).toEqual([0]);
    expect(s.signings.map((x) => [x.playerId, x.clubId, x.agent])).toEqual([
      [3, 6, 0],
      [6, 5, 1],
    ]);
    expect(s.agents[0]!.hand).toEqual([1, 3, 4]);
  });

  it('같은 선수: 매력도 높은 쪽이 계약, 진 쪽도 카드는 소모', () => {
    const s = resolveRound(state(), { 0: offer({ demand: 1 }), 1: offer({ demand: 3 }) });
    expect(s.agents[0]!.score).toBe(3);
    expect(s.agents[1]!.score).toBe(0);
    expect(s.agents[1]!.hand).toEqual([1, 2, 4]);
    const lost = s.results[0]!.entries.find((e) => e.agent === 1)!;
    expect(lost).toMatchObject({ status: 'lost', winner: 0, winnerAttract: 2 });
  });

  it('동률이면 둘 다 탈락 (상쇄), 선수는 시장에 남는다', () => {
    const s = resolveRound(state(), { 0: offer(), 1: offer() });
    expect(s.agents.map((a) => a.score)).toEqual([0, 0]);
    expect(s.results[0]!.entries.every((e) => e.tied)).toBe(true);
    expect(s.market).toContain(3);
  });

  it('몸값 미달은 실패하지만 공개된 카드는 소모, 패스는 소모 없음', () => {
    const s = resolveRound(state(), { 0: offer({ playerId: 0, clubId: 6, demand: 4 }), 1: null });
    expect(s.results[0]!.entries.map((e) => e.status)).toEqual(['invalid', 'pass']);
    expect(s.agents[0]!.hand).toEqual([1, 2, 3]);
    expect(s.agents[1]!.hand).toEqual([1, 2, 3, 4]);
  });

  it('스폰서 데이 계약은 비밀 구단 보너스 2배로 센다', () => {
    const s = resolveRound(withEvent('sponsor'), { 0: offer(), 1: null });
    expect(s.signings[0]!.weight).toBe(2);
    expect(clubWeight(s, 6)).toBe(2);
  });

  it('사람 제출이 없으면 오류', () => {
    expect(() => resolveRound(state(), { 0: null })).toThrow();
  });
});

describe('게임 진행', () => {
  const setup = [
    { name: 'A', kind: 'human' as const },
    { name: 'B', kind: 'ai' as const, level: 'normal' as const },
    { name: 'C', kind: 'ai' as const },
  ];

  it('createGame: 구단 6곳, 비밀 구단은 서로 다르고 이번 게임 구단 중 하나, 마지막 이벤트는 데드라인 데이', () => {
    const g = createGame(setup, 42);
    expect(g.clubs).toHaveLength(CLUBS_IN_GAME);
    const secrets = g.agents.map((a) => a.secret);
    expect(new Set(secrets).size).toBe(3);
    expect(secrets.every((s) => g.clubs.includes(s))).toBe(true);
    expect(g.events).toHaveLength(TOTAL_ROUNDS);
    expect(g.events.at(-1)).toBe('deadline');
    expect(new Set(g.events.slice(0, -1)).size).toBe(TOTAL_ROUNDS - 1);
    expect(g.market).toHaveLength(marketSize(3));
    expect(currentEvent(g)).toBe(g.events[0]);
    expect(upcomingEvent(g)).toBe(g.events[1]);
  });

  it('같은 시드는 같은 게임', () => {
    expect(createGame(setup, 7)).toEqual(createGame(setup, 7));
  });

  it('시장: 남은 선수는 그대로 두고 N+1명까지 채운다 (해외파 귀국 +2)', () => {
    const s = dealRound(state({ market: [3] }));
    expect(s.market[0]).toBe(3);
    expect(s.market).toHaveLength(3);
    const o = dealRound(withEvent('overseas'));
    expect(o.market.length).toBeGreaterThanOrEqual(5);
    // 계약된 선수는 다시 나오지 않는다
    const signed = dealRound(state({ market: [], signings: [{ playerId: 0, clubId: 0, agent: 0, round: 1, weight: 1 }] }));
    expect(signed.market).not.toContain(0);
  });

  it('8라운드 뒤 지목 단계 → 종료 정산', () => {
    let g = createGame(setup, 3);
    for (let r = 1; r <= TOTAL_ROUNDS; r++) {
      expect(g.phase).toBe('bid');
      g = nextRound(resolveRound(g, { 0: null }));
    }
    expect(g.phase).toBe('guess');
    const done = finishGame(g, { 0: { 1: g.agents[1]!.secret, 2: g.clubs.find((c) => c !== g.agents[2]!.secret && c !== g.agents[0]!.secret)! } });
    expect(done.phase).toBe('done');
    const me = done.agents[0]!.final!;
    expect(me.guessPoints).toBe(GUESS_BONUS);
    expect(done.agents[1]!.final!.exposed).toBe(true);
    expect(done.agents[1]!.final!.clubPoints).toBe(0);
    expect(winners(done).length).toBeGreaterThan(0);
  });

  it('비밀 구단 보너스: 들키지 않으면 구단 아래 선수 1명당 +2, 누가 계약했든 센다', () => {
    const base = state({
      phase: 'guess',
      round: TOTAL_ROUNDS,
      signings: [
        { playerId: 3, clubId: 0, agent: 1, round: 1, weight: 1 },
        { playerId: 6, clubId: 0, agent: 0, round: 2, weight: 2 },
      ],
    });
    // A 비밀 0, B 비밀 1. B가 5를 지목(오답), A는 B를 5로 지목(오답)
    const done = finishGame(base, { 0: { 1: 5 }, 1: { 0: 5 } });
    expect(done.agents[0]!.final).toMatchObject({ exposed: false, clubDeals: 3, clubPoints: 3 * CLUB_BONUS, guessPoints: 0 });
    // B가 A를 맞히면 A는 보너스 몰수, B +3
    const caught = finishGame(base, { 0: { 1: 5 }, 1: { 0: 0 } });
    expect(caught.agents[0]!.final).toMatchObject({ exposed: true, clubPoints: 0 });
    expect(caught.agents[1]!.final!.guessPoints).toBe(GUESS_BONUS);
    expect(rankings(caught)[0]!.agent).toBe(1);
  });

  it('지목 단계 전에는 finishGame 불가, 사람 지목이 없으면 오류', () => {
    expect(() => finishGame(state(), {})).toThrow();
    expect(() => finishGame(state({ phase: 'guess' }), {})).toThrow();
  });
});

describe('공개 기록과 AI', () => {
  it('clubMarks: 에이전트별 구단 제안 횟수 (실패 포함, 몸값 미달 제외)', () => {
    const s = resolveRound(state(), { 0: offer(), 1: offer({ demand: 1 }) });
    const m = clubMarks(s);
    expect(m[0]![6]).toBe(1);
    expect(m[1]![6]).toBe(1);
    expect(m[0]![0]).toBe(0);
  });

  it('evidence: 더 맞는 구단을 두고 고르면 가중치가 붙는다', () => {
    // 최준서 → 블루 드래곤즈 (적합 2, 최적은 썬더 울브스 3) → 1 + 1
    const s = resolveRound(state(), { 0: offer({ clubId: 0 }), 1: null });
    expect(evidence(s, 0).get(0)).toBe(2);
  });

  it('AI 제안은 항상 유효하거나 패스, 같은 rng 상태면 같은 결과', () => {
    for (const level of ['easy', 'normal'] as const) {
      const g = createGame(
        [
          { name: 'A', kind: 'ai', level },
          { name: 'B', kind: 'ai', level },
        ],
        11,
      );
      const o = makeAiOffer(g, 0, createRng(5));
      if (o) expect(typeof validateOffer(g, 0, o)).toBe('object');
      expect(makeAiOffer(g, 0, createRng(5))).toEqual(o);
    }
  });

  it('AI 지목은 자기 비밀 구단을 제외한 이번 게임 구단', () => {
    const g = { ...createGame([{ name: 'A', kind: 'ai', level: 'normal' }, { name: 'B', kind: 'ai' }, { name: 'C', kind: 'ai' }], 9), phase: 'guess' as const };
    const gs = makeAiGuesses(g, 0, createRng(1));
    expect(Object.keys(gs).map(Number).sort()).toEqual([1, 2]);
    for (const c of Object.values(gs)) {
      expect(g.clubs).toContain(c);
      expect(c).not.toBe(g.agents[0]!.secret);
    }
  });

  it('AI끼리 끝까지 진행해도 오류 없이 종료 (2~4인)', () => {
    for (const n of [2, 3, 4]) {
      let g = createGame(
        Array.from({ length: n }, (_, i) => ({ name: `AI${i}`, kind: 'ai' as const, level: i % 2 ? ('normal' as const) : ('easy' as const) })),
        100 + n,
      );
      while (g.phase !== 'guess') g = nextRound(resolveRound(g, {}));
      g = finishGame(g, {});
      expect(g.agents.every((a) => a.final && a.final.total >= a.score)).toBe(true);
      expect(PLAYERS.length).toBeGreaterThanOrEqual(g.signings.length + g.market.length);
    }
  });
});
