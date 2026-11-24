import { describe, expect, it } from 'vitest';
import {
  AI_MODEL,
  CLUBS_IN_GAME,
  NORMAL_FIELD,
  RULES,
  PLAYERS,
  TOTAL_ROUNDS,
  cardCost,
  cardStyle,
  clubWeight,
  contest,
  createGame,
  createRng,
  currentEvent,
  dealRound,
  evaluateOffer,
  finishGame,
  GOALS,
  goalBelief,
  goalGain,
  goalProgress,
  goalResults,
  makeAiBid,
  makeAiOffer,
  initialHand,
  marketSize,
  need,
  needsOf,
  NEEDS,
  rotateNeeds,
  nextRound,
  playCard,
  resolveRound,
  upcomingEvent,
  validateOffer,
  validateSecond,
  winners,
} from './index';
import type { AgentState, Demand, EventKey, GameState, Offer, RoundBid, Submission } from './types';

// 선수: 0 강태오 FW 몸값8 스타 기본4 / 1 윤시후 MF 몸값6 플메 기본3 / 3 최준서 FW 몸값3 유망주 기본2 / 6 정우진 DF 몸값2 멀티 기본2
// 구단: 0 블루 드래곤즈 10 FW 스타 / 1 실버 호크스 8 MF 플메 / 5 노바 크루저스 6 DF 베테랑 / 6 썬더 울브스 5 FW 유망주

const agent = (over: Partial<AgentState> = {}): AgentState => ({ name: 'A', kind: 'human', score: 0, deals: 0, hand: [1, 1, 2, 2, 3, 3, 4, 4], goals: [0], ...over });

const state = (over: Partial<GameState> = {}): GameState => ({
  v: 8,
  rng: 1,
  round: 1,
  phase: 'bid',
  events: ['normal', 'normal', 'normal', 'normal', 'deadline'],
  market: [0, 3, 6],
  clubs: [0, 1, 5, 6],
  // 구단마다 첫 요구 카드(id = 구단 × 3)가 공개된 상태
  needs: { 0: 0, 1: 3, 5: 15, 6: 18 },
  needDecks: { 0: [1, 2], 1: [4, 5], 5: [16, 17], 6: [19, 20] },
  signings: [],
  agents: [agent({ name: 'A', goals: [0] }), agent({ name: 'B', goals: [5] })],
  results: [],
  ...over,
});

/** 최준서 → 썬더 울브스, 요구 2: 매력도 3 − 2 = 1, 수수료 2 + 3 = 5 (카드 2 = +3억) */
const offer = (over: Partial<Offer> = {}): Offer => ({ playerId: 3, clubId: 6, demand: 2, ...over });
const ev = (o: Offer, e: EventKey = 'normal') => evaluateOffer(o, e, state().needs);
const withEvent = (e: EventKey) => state({ events: [e, 'normal', 'normal', 'normal', 'deadline'] });
/** 1·2차 제출 (2차 생략 = 패스) */
const bid = (first: Submission, second: Submission = null): RoundBid => ({ first, second });

describe('evaluateOffer (정수 계산)', () => {
  it('매력도 = 적합도 − 카드의 매력도 감점, 수수료 = 기본 + 요구 수수료', () => {
    expect(ev(offer())).toEqual({ attract: 1, fee: 5 });
    expect(ev(offer({ demand: 4 }))).toEqual({ attract: -1, fee: 8 });
    // 정우진(DF 멀티) → 실버 호크스(MF 플메): 적합 0
    expect(ev(offer({ playerId: 6, clubId: 1, demand: 1 }))).toEqual({ attract: -1, fee: 3 });
  });

  it('제시액이 몸값보다 낮으면 몸값 미달', () => {
    // 강태오 몸값 8 → 썬더 울브스 제시액 5
    expect(ev(offer({ playerId: 0, clubId: 6 }))).toBe('under-cost');
  });

  it('이벤트: 수수료 +2 (공격수 품귀·유망주 열풍·수비 보강·빅딜 시즌), 데드라인 데이 +deadlineBonus', () => {
    expect(ev(offer(), 'fw')).toEqual({ attract: 1, fee: 7 });
    expect(ev(offer(), 'young')).toEqual({ attract: 1, fee: 7 });
    expect(ev(offer(), 'defense')).toEqual({ attract: 1, fee: 5 });
    expect(ev(offer({ playerId: 6, clubId: 5 }), 'defense')).toEqual({ attract: 0, fee: 7 });
    expect(ev(offer(), 'big')).toEqual({ attract: 1, fee: 5 });
    expect(ev(offer({ playerId: 0, clubId: 0 }), 'big')).toEqual({ attract: 1, fee: 9 });
    expect(ev(offer(), 'deadline')).toEqual({ attract: 1, fee: 5 + RULES.deadlineBonus });
  });

  it('구단 긴축: 제시액 −2', () => {
    // 최준서 몸값 3 → 썬더 울브스 5 − 2 = 3 (가능), 강태오 8 → 블루 드래곤즈 10 − 2 = 8 (가능)
    expect(ev(offer(), 'budget')).toEqual({ attract: 1, fee: 5 });
    expect(ev(offer({ playerId: 1, clubId: 6 }), 'budget')).toBe('under-cost');
  });
});

describe('요구 수수료 카드 (소진형)', () => {
  it('시작 손패는 종류별 3장, 낸 카드는 1장 버리고 돌아오지 않는다', () => {
    expect(initialHand()).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
    expect(playCard([1, 1, 2, 3], 1)).toEqual([1, 2, 3]);
    expect(playCard([4], 4)).toEqual([]);
  });
  it('실험용 copies=0: 소진 없이 매번 1~4 중 자유', () => {
    RULES.copies = 0;
    try {
      expect(playCard([1, 2, 3, 4], 3)).toEqual([1, 2, 3, 4]);
    } finally {
      RULES.copies = 3;
    }
  });
  it('손에 없는 카드는 낼 수 없다', () => {
    const s = state({ agents: [agent({ hand: [1, 3] }), agent()] });
    expect(validateOffer(s, 0, offer({ demand: 2 }))).toBe('card-not-owned');
    expect(validateOffer(s, 0, offer({ demand: 3 }))).toEqual({ attract: 0, fee: 7 });
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
  it('최고 매력도가 같으면 요구 수수료 카드가 낮은(수수료가 적은) 쪽이 계약 (카드까지 같으면 상쇄)', () => {
    const d = (agent: number, attract: number, demand: Demand) => ({ agent, offer: offer({ demand }), attract, fee: 4 });
    const r = contest([d(0, 1, 3), d(1, 1, 2), d(2, 0, 1)]);
    expect(r.winner?.agent).toBe(1);
    expect(r.beaten.map((x) => x.agent)).toEqual([0, 2]);
    const t = contest([d(0, 1, 2), d(1, 1, 2), d(2, 1, 3), d(3, 0, 1)]);
    expect(t.winner?.agent).toBe(3);
    expect(t.cancelled.map((x) => x.agent)).toEqual([0, 1, 2]);
  });
});

describe('resolveRound', () => {
  it('서로 다른 선수 제안은 모두 성사, 계약 선수는 시장에서 빠지고 구단 아래 놓인다', () => {
    const s = resolveRound(state(), { 0: bid(offer()), 1: bid(offer({ playerId: 6, clubId: 5, demand: 1 })) });
    expect(s.agents.map((a) => a.score)).toEqual([5, 3]);
    expect(s.market).toEqual([0]);
    expect(s.signings.map((x) => [x.playerId, x.clubId, x.agent])).toEqual([
      [3, 6, 0],
      [6, 5, 1],
    ]);
    expect(s.agents[0]!.hand).toEqual([1, 1, 2, 3, 3, 4, 4]);
  });

  it('같은 선수: 매력도 높은 쪽이 계약', () => {
    const s = resolveRound(state(), { 0: bid(offer({ demand: 1 })), 1: bid(offer({ demand: 3 })) });
    expect(s.agents[0]!.score).toBe(3);
    expect(s.agents[1]!.score).toBe(0);
    const lost = s.results[0]!.entries.find((e) => e.agent === 1)!;
    expect(lost).toMatchObject({ status: 'lost', winner: 0, winnerAttract: 2 });
  });

  it('매력도·카드까지 같으면 둘 다 탈락 (상쇄), 선수는 시장에 남는다', () => {
    const s = resolveRound(state(), { 0: bid(offer()), 1: bid(offer()) });
    expect(s.agents.map((a) => a.score)).toEqual([0, 0]);
    expect(s.results[0]!.entries.filter((e) => e.stage === 1).every((e) => e.tied)).toBe(true);
    expect(s.market).toContain(3);
  });

  it('몸값 미달은 실패(카드 소모), 패스는 패스로 기록(카드 그대로)', () => {
    const s = resolveRound(state(), { 0: bid(offer({ playerId: 0, clubId: 6, demand: 4 })), 1: bid(null) });
    expect(s.results[0]!.entries.filter((e) => e.stage === 1).map((e) => e.status)).toEqual(['invalid', 'pass']);
    expect(s.agents.every((a) => a.deals === 0)).toBe(true);
    expect(s.agents[0]!.hand).toEqual([1, 1, 2, 2, 3, 3, 4]);
    expect(s.agents[1]!.hand).toHaveLength(8);
  });

  it('1차를 모두 정산한 뒤 2차: 1차와 다른 선수·구단, 1차에서 계약된 선수를 노린 2차는 협상 무산(카드 소모)', () => {
    const s = resolveRound(state(), {
      // A: 1차 최준서→썬더 울브스, 2차 정우진→노바 크루저스
      0: bid(offer(), offer({ playerId: 6, clubId: 5, demand: 1 })),
      // B: 1차 정우진→실버 호크스(매력도 −1, 짐), 2차 최준서(1차에서 A가 계약) → 무산
      1: bid(offer({ playerId: 6, clubId: 1, demand: 1 }), offer({ clubId: 0, demand: 3 })),
    });
    const e = s.results[0]!.entries;
    expect(e.map((x) => [x.stage, x.agent, x.status])).toEqual([
      [1, 0, 'won'],
      [1, 1, 'won'],
      [2, 0, 'invalid'],
      [2, 1, 'invalid'],
    ]);
    // 1차에서 B가 정우진을 계약했으므로 A의 2차도 무산
    expect(e.filter((x) => x.stage === 2).map((x) => x.reason)).toEqual(['signed', 'signed']);
    expect(s.agents.map((a) => a.hand.length)).toEqual([6, 6]);
    expect(s.agents.map((a) => a.deals)).toEqual([1, 1]);
  });

  it('2차는 1차 뒤 남은 선수끼리 경쟁해 계약할 수 있다', () => {
    const s = resolveRound(state(), { 0: bid(offer(), offer({ playerId: 6, clubId: 5, demand: 1 })), 1: bid(null, offer({ playerId: 6, clubId: 1, demand: 1 })) });
    expect(s.agents.map((a) => a.score)).toEqual([5 + 3, 0]);
    expect(s.signings.map((x) => [x.playerId, x.clubId])).toEqual([
      [3, 6],
      [6, 5],
    ]);
    expect(s.market).toEqual([0]);
  });

  it('2차가 1차와 같은 선수 또는 같은 구단이면 무효 (카드 미소모)', () => {
    const s = resolveRound(state(), { 0: bid(offer(), offer({ demand: 1 })), 1: bid(offer({ playerId: 6, clubId: 5, demand: 1 }), offer({ playerId: 0, clubId: 5 })) });
    expect(s.results[0]!.entries.filter((e) => e.stage === 2).map((e) => e.reason)).toEqual(['duplicate', 'duplicate']);
    expect(s.agents.map((a) => a.hand.length)).toEqual([7, 7]);
  });

  it('2차 카드는 1차를 뺀 손에서: 1장 남은 종류는 1·2차에 함께 낼 수 없다', () => {
    const s = state({ agents: [agent({ hand: [2, 4] }), agent()] });
    expect(validateSecond(s, 0, offer(), offer({ playerId: 6, clubId: 5, demand: 2 }))).toBe('card-not-owned');
    expect(typeof validateSecond(s, 0, offer(), offer({ playerId: 6, clubId: 5, demand: 4 }))).toBe('object');
    expect(typeof validateSecond(state(), 0, offer(), offer({ playerId: 6, clubId: 5, demand: 2 }))).toBe('object');
    const r = resolveRound(s, { 0: bid(offer(), offer({ playerId: 6, clubId: 5, demand: 2 })), 1: bid(null) });
    expect(r.results[0]!.entries.find((e) => e.stage === 2 && e.agent === 0)!.reason).toBe('card-not-owned');
    expect(r.agents[0]!.hand).toEqual([4]);
  });

  it('카드를 다 쓰면 낼 수 없다', () => {
    const s = state({ agents: [agent({ hand: [] }), agent()] });
    expect(validateOffer(s, 0, offer())).toBe('card-not-owned');
  });

  it('스폰서 데이 계약은 목표 카드에서 2명으로 센다 (구단 계약 수는 1명)', () => {
    const s = resolveRound(withEvent('sponsor'), { 0: bid(offer()), 1: bid(null) });
    expect(s.signings[0]!.weight).toBe(2);
    expect(clubWeight(s, 6)).toBe(1);
    // 최준서(FW) → 공격 본능(FW 3명) 진척 2
    expect(goalProgress(0, s.signings)).toBe(2);
  });

  it('사람 제출이 없으면 오류', () => {
    expect(() => resolveRound(state(), { 0: bid(null) })).toThrow();
  });
});

describe('게임 진행', () => {
  const setup = [
    { name: 'A', kind: 'human' as const },
    { name: 'B', kind: 'ai' as const, level: 'normal' as const },
    { name: 'C', kind: 'ai' as const },
  ];

  it('createGame: 구단 6곳, 목표 카드는 각자 goalsPerAgent 장이고 서로 겹치지 않음, 마지막 이벤트는 데드라인 데이', () => {
    const g = createGame(setup, 42);
    expect(g.clubs).toHaveLength(CLUBS_IN_GAME);
    const goals = g.agents.flatMap((a) => a.goals);
    expect(g.agents.every((a) => a.goals.length === RULES.goalsPerAgent)).toBe(true);
    expect(new Set(goals).size).toBe(goals.length);
    expect(goals.every((id) => GOALS[id] !== undefined)).toBe(true);
    expect(TOTAL_ROUNDS).toBe(5);
    expect(g.events).toHaveLength(TOTAL_ROUNDS);
    expect(g.events.at(-1)).toBe('deadline');
    expect(new Set(g.events.slice(0, -1)).size).toBe(TOTAL_ROUNDS - 1);
    expect(g.market).toHaveLength(marketSize(3));
    expect(marketSize(3)).toBe(7);
    expect(g.agents.every((a) => a.hand.length === 12)).toBe(true);
    // 구단마다 자기 요구 카드 1장 공개 + 2장 더미
    for (const c of g.clubs) {
      expect(need(g.needs[c]!).club).toBe(c);
      expect(g.needDecks[c]).toHaveLength(2);
      expect(new Set([g.needs[c], ...g.needDecks[c]!])).toEqual(new Set(needsOf(c)));
    }
    expect(currentEvent(g)).toBe(g.events[0]);
    expect(upcomingEvent(g)).toBe(g.events[1]);
  });

  it('같은 시드는 같은 게임', () => {
    expect(createGame(setup, 7)).toEqual(createGame(setup, 7));
  });

  it('시장: 남은 선수는 그대로 두고 2N+1명까지 채운다 (해외파 귀국 +2)', () => {
    const s = dealRound(state({ market: [3] }));
    expect(s.market[0]).toBe(3);
    expect(s.market).toHaveLength(5);
    const o = dealRound(withEvent('overseas'));
    expect(o.market).toHaveLength(7);
    // 계약된 선수는 다시 나오지 않는다
    const signed = dealRound(state({ market: [], signings: [{ playerId: 0, clubId: 0, agent: 0, round: 1, weight: 1 }] }));
    expect(signed.market).not.toContain(0);
  });

  it('요구 카드 데이터: 구단마다 3장, 모든 카드에 포지션·특성이 둘 다 맞는 선수가 있다', () => {
    expect(NEEDS).toHaveLength(36);
    for (let c = 0; c < 12; c++) expect(needsOf(c)).toHaveLength(3);
    for (const n of NEEDS) expect(PLAYERS.some((p) => p.pos === n.pos && p.trait === n.pref)).toBe(true);
  });

  it('요구 카드 교체: 이번 라운드에 계약된 구단만 공개 카드를 더미 맨 아래로 넣고 다음 카드를 연다', () => {
    // 최준서 → 썬더 울브스(6) 계약, 나머지 구단은 계약 없음
    const r = resolveRound(state(), { 0: bid(offer()), 1: bid(null) });
    expect(r.results[0]!.needs).toEqual(state().needs);
    const n = rotateNeeds(r);
    expect(n.needs).toEqual({ 0: 0, 1: 3, 5: 15, 6: 19 });
    expect(n.needDecks[6]).toEqual([20, 18]);
    expect(n.needDecks[0]).toEqual([1, 2]);
    // nextRound 가 적용하고, 다음 라운드 평가는 새 요구 카드(썬더 울브스 GK·유망주)로 한다
    const next = nextRound(r);
    expect(next.needs[6]).toBe(19);
    expect(evaluateOffer({ playerId: 32, clubId: 6, demand: 1 }, 'normal', next.needs)).toEqual({ attract: 0, fee: 3 });
    // 지난 라운드 기록은 그때 요구 카드로 남는다
    expect(next.results[0]!.needs[6]).toBe(18);
  });

  it('요구 카드 교체를 끄면 (needRotate 0) 그대로', () => {
    RULES.needRotate = 0;
    try {
      const r = resolveRound(state(), { 0: bid(offer()), 1: bid(null) });
      expect(rotateNeeds(r).needs).toEqual(state().needs);
    } finally {
      RULES.needRotate = 1;
    }
  });

  it('5라운드 뒤 바로 종료: 목표 카드 공개·정산', () => {
    let g = createGame(setup, 3);
    for (let r = 1; r <= TOTAL_ROUNDS; r++) {
      expect(g.phase).toBe('bid');
      g = nextRound(resolveRound(g, { 0: bid(null) }));
    }
    expect(g.phase).toBe('done');
    expect(g.agents.every((a) => a.final && a.final.total === a.score + a.final.goalPoints)).toBe(true);
    expect(winners(g).length).toBeGreaterThan(0);
  });

  it('목표 카드 데이터: 12장, 조건마다 맞는 선수가 필요 인원 이상 있다', () => {
    expect(GOALS).toHaveLength(12);
    for (const g of GOALS) {
      const all = PLAYERS.map((p) => ({ playerId: p.id, weight: 1 }));
      expect(goalProgress(g.id, all)).toBeGreaterThanOrEqual(g.n);
    }
  });

  it('목표 보너스: 내가 직접 계약시킨 선수로 조건을 채우면 +goalBonus, 못 채우면 0 (스폰서 데이 2명)', () => {
    // A 목표 0 (FW 3명), B 목표 5 (베테랑 3명)
    const base = state({
      phase: 'result',
      round: TOTAL_ROUNDS,
      signings: [
        { playerId: 0, clubId: 0, agent: 0, round: 1, weight: 1 }, // 강태오 FW
        { playerId: 3, clubId: 6, agent: 0, round: 2, weight: 2 }, // 최준서 FW (스폰서)
        { playerId: 2, clubId: 5, agent: 1, round: 1, weight: 1 }, // 박도윤 베테랑
        { playerId: 14, clubId: 5, agent: 1, round: 3, weight: 1 }, // 장민호 FW·베테랑 — B 계약이라 A 목표에는 안 셈
      ],
    });
    expect(goalResults(base, 0)).toEqual([{ goal: 0, progress: 3, done: true, points: RULES.goalBonus }]);
    expect(goalResults(base, 1)).toEqual([{ goal: 5, progress: 2, done: false, points: 0 }]);
    const done = finishGame({ ...base, agents: base.agents.map((a, i) => ({ ...a, score: i === 0 ? 5 : 20 })) });
    expect(done.phase).toBe('done');
    expect(done.agents[0]!.final).toMatchObject({ goalPoints: RULES.goalBonus, total: 5 + RULES.goalBonus });
    expect(done.agents[1]!.final).toMatchObject({ goalPoints: 0, total: 20 });
  });

  it('완성형 스쿼드: 포지션 종류 수로 센다 (스폰서 데이와 무관)', () => {
    const id = GOALS.find((g) => g.rule.kind === 'allPos')!.id;
    const sg = (playerId: number, weight = 1) => ({ playerId, weight });
    expect(goalProgress(id, [sg(0, 2), sg(3), sg(1)])).toBe(2);
    expect(goalProgress(id, [sg(0), sg(1), sg(2), sg(4)])).toBe(4);
  });
});

describe('AI', () => {
  it('cardCost: 시즌 중에는 높은 카드일수록 비싸고, 마지막 협상에는 카드 종류와 무관하다', () => {
    const hand: Demand[] = [1, 1, 2, 2, 3, 3, 4, 4];
    const early = state({ round: 1 });
    expect(cardCost(early, hand, 1, 4)).toBeGreaterThan(cardCost(early, hand, 1, 1));
    // 성향 배율이 0이면 종류 차이가 사라진다
    expect(cardCost(early, hand, 1, 4, 0)).toBeCloseTo(cardCost(early, hand, 1, 1, 0));
    const last = state({ round: TOTAL_ROUNDS });
    expect(cardCost(last, [1, 4], 2, 4)).toBeCloseTo(cardCost(last, [1, 4], 2, 1));
  });

  it('cardStyle: 같은 게임·자리면 같고, 1 ± cardMix 범위다', () => {
    const s = state();
    expect(cardStyle(s, 1)).toBe(cardStyle(s, 1));
    for (let i = 0; i < 4; i++) {
      const v = cardStyle(s, i);
      expect(v).toBeGreaterThanOrEqual(1 - AI_MODEL.cardMix);
      expect(v).toBeLessThanOrEqual(1 + AI_MODEL.cardMix);
    }
  });

  it('goalGain: 목표에 맞는 선수만 가치가 있고, 달성하는 계약은 보너스 전부', () => {
    // A 목표 0 (FW 3명): 이미 FW 2명
    const s = state({ signings: [0, 7].map((playerId) => ({ playerId, clubId: 0, agent: 0, round: 1, weight: 1 })) });
    expect(goalGain(s, 0, [0], 3, 1, 1)).toBe(RULES.goalBonus);
    expect(goalGain(s, 0, [0], 1, 1, 1)).toBe(0);
    // 아직 0명이면 일부만
    const v = goalGain(state(), 0, [0], 3, 1, 1);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(RULES.goalBonus);
  });

  it('goalBelief: 내 목표는 빼고, 조건에 맞는 선수에 제안한 목표의 확률이 오른다', () => {
    const s = resolveRound(state(), { 0: bid(offer()), 1: bid(null) });
    const b = goalBelief(s, 0, [5]);
    expect(b.has(5)).toBe(false);
    expect([...b.values()].reduce((a, x) => a + x, 0)).toBeCloseTo(1);
    // 최준서(FW·유망주): 공격 본능 > 중원 사령관
    expect(b.get(0)!).toBeGreaterThan(b.get(1)!);
  });

  it('AI 제안은 항상 유효하거나 패스, 같은 rng 상태면 같은 결과', () => {
    for (const level of ['easy', 'normal'] as const) {
      const g = createGame(
        [
          { name: 'A', kind: 'ai', level },
          { name: 'B', kind: 'ai', level },
          { name: 'C', kind: 'ai', level },
        ],
        11,
      );
      const o = makeAiOffer(g, 0, createRng(5));
      if (o) expect(typeof validateOffer(g, 0, o)).toBe('object');
      expect(makeAiOffer(g, 0, createRng(5))).toEqual(o);
      const b = makeAiBid(g, 0, createRng(5));
      if (b.second) {
        expect(typeof validateSecond(g, 0, b.first, b.second)).toBe('object');
        if (b.first) expect(b.second.playerId === b.first.playerId || b.second.clubId === b.first.clubId).toBe(false);
      }
    }
  });

  it('보통 AI는 자리 순서대로 서로 다른 성향을 받는다 (쉬움·사람·지정 성향은 그대로)', () => {
    const g = createGame(
      [
        { name: 'H', kind: 'human' },
        { name: 'A', kind: 'ai', level: 'normal' },
        { name: 'B', kind: 'ai', level: 'normal' },
        { name: 'C', kind: 'ai', level: 'normal' },
      ],
      3,
    );
    expect(g.agents.map((a) => a.persona)).toEqual([undefined, ...NORMAL_FIELD]);
    const h = createGame([{ name: 'A', kind: 'ai' }, { name: 'B', kind: 'ai', level: 'normal', persona: 'greedy' }, { name: 'C', kind: 'ai', level: 'normal' }], 3);
    expect(h.agents.map((a) => a.persona)).toEqual([undefined, 'greedy', 'balanced']);
  });

  it('AI끼리 끝까지 진행해도 오류 없이 종료 (3~4인), 2인은 만들 수 없다', () => {
    expect(() => createGame([{ name: 'A', kind: 'human' }, { name: 'B', kind: 'ai' }], 1)).toThrow();
    for (const n of [3, 4]) {
      let g = createGame(
        Array.from({ length: n }, (_, i) => ({ name: `AI${i}`, kind: 'ai' as const, level: i % 2 ? ('normal' as const) : ('easy' as const) })),
        100 + n,
      );
      while (g.phase !== 'done') g = nextRound(resolveRound(g, {}));
      expect(g.agents.every((a) => a.final && a.final.total === a.score + a.final.goalPoints)).toBe(true);
      expect(PLAYERS.length).toBeGreaterThanOrEqual(g.signings.length + g.market.length);
    }
  });
});
