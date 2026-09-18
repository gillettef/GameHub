import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { cards } from './cards';
import { addToRoster } from './effects';
import { acceptMatchRoll, rerollMatchDie, rollMatchDie, standsCount, startFriday, submitLineup } from './friday';
import { GameError } from './state';
import type { GameState } from './state';
import { autoLineup, gameAtMonday, seededRng, settlePending } from './test-utils';

function friday(): GameState {
  const s = gameAtMonday();
  startFriday(s);
  for (const id of s.seats) {
    s.players[id]!.resources = { money: 5, fandom: 3, ops: 2, stamina: 6 };
    s.players[id]!.pending = [];
  }
  return s;
}

function submitAll(s: GameState, seed = 1): GameState {
  for (const id of s.seats) s = settlePending(submitLineup(s, id, autoLineup(s.players[id]!), seededRng(seed)), seededRng(seed));
  return s;
}

describe('경기 준비 제출 (p.20)', () => {
  it('출전 선수마다 체력 1, 관중석 팬덤 지불, 전원 제출 시 판정', () => {
    let s = friday();
    const sub = { ...autoLineup(s.players['a']!), fandomInStands: 2 };
    s = submitLineup(s, 'a', sub, seededRng());
    expect(s.players['a']!.resources.stamina).toBe(6 - 2);
    expect(s.players['a']!.resources.fandom).toBe(1);
    expect(() => submitLineup(s, 'a', sub, seededRng())).toThrow(GameError);
    expect(s.phase.kind).toBe('friday.prepare');
    for (const id of ['b', 'c', 'd']) s = submitLineup(s, id, autoLineup(s.players[id]!), seededRng());
    expect(s.phase.kind).toBe('friday.aftermath');
    expect(s.players['a']!.resources.money).toBe(5 + 2);
    expect(s.players['a']!.opponentDeck).toHaveLength(5);
  });

  it('관중석 수 = 인쇄 2 + 3번/4번 관중석', () => {
    const s = friday();
    const p = s.players['a']!;
    expect(standsCount(p)).toBe(2);
    p.infrastructure.push('stand3', 'shop');
    expect(standsCount(p)).toBe(3);
    expect(() => submitLineup(s, 'a', { ...autoLineup(p), fandomInStands: 4 }, seededRng())).toThrow(GameError);
  });

  it('부상·출장정지 선수, 같은 등번호, 손에 없는 전술 카드, 포메이션 불일치 거부', () => {
    const s = friday();
    const p = s.players['a']!;
    const base = autoLineup(p);
    p.roster[0]!.tokens.injury = 1;
    expect(() => submitLineup(s, 'a', base, seededRng())).toThrow(GameError);
    p.roster[0]!.tokens.injury = 0;

    expect(() => submitLineup(s, 'a', { ...base, tacticCardId: 'tc-99' }, seededRng())).toThrow(GameError);
    expect(() => submitLineup(s, 'a', { ...base, formationIndex: 5 }, seededRng())).toThrow(GameError);

    const wrong = { ...base, placements: { ...base.placements } };
    const [first, second] = Object.keys(wrong.placements);
    wrong.placements[first!] = wrong.placements[second!]!;
    wrong.placements[second!] = 'RW';
    expect(() => submitLineup(s, 'a', wrong, seededRng())).toThrow(GameError);
  });

  it('체력이 부족하면 거부', () => {
    const s = friday();
    s.players['a']!.resources.stamina = 1;
    expect(() => submitLineup(s, 'a', autoLineup(s.players['a']!), seededRng())).toThrow(GameError);
  });

  it('제출 시 부상/출장정지 토큰을 카드마다 1개씩 제거 (p.20 4)', () => {
    const s = friday();
    const p = s.players['a']!;
    p.roster[1]!.tokens.suspension = 2;
    p.staff[0]!.suspension = 1;
    const next = submitLineup(s, 'a', autoLineup(p, [p.roster[0]!.instanceId]), seededRng());
    expect(next.players['a']!.roster[1]!.tokens.suspension).toBe(1);
    expect(next.players['a']!.staff[0]!.suspension).toBe(0);
  });
});

describe('경기 전 효과 (p.22)', () => {
  it('대상 선택이 필요한 경기 전 효과는 제출 시점에 대기하고, 고른 뒤에야 다음 차례로 넘어가며 토큰이 경기에 반영된다', () => {
    const rng = seededRng(7);
    let s = friday();
    const a = s.players['a']!;
    // p-s01 훈련 면: 경기 전 1[체력] → 선수 1명에 일시적 역량 1개 (대상 선택)
    const booster = addToRoster(a, 'p-s01');
    booster.trained = true;
    a.scouted = true;
    const sub = autoLineup(a);
    if (!sub.players.includes(booster.instanceId)) sub.players.push(booster.instanceId);
    const lineup = { ...autoLineup(a, sub.players), activations: { [booster.instanceId]: { stamina: 1 } } };
    s = submitLineup(s, 'a', lineup, rng);
    expect(s.phase.kind === 'friday.prepare' && s.phase.current).toBe('a'); // 대상 선택 전에는 차례가 넘어가지 않는다
    expect(s.phase.kind === 'friday.prepare' && !!s.phase.submitted['a']).toBe(true);
    const pending = s.players['a']!.pending[0]!;
    expect(pending.effect).toEqual({ type: 'addPlayerToken', token: 'strengthTemp', count: 1 });
    expect(() => submitLineup(s, 'b', autoLineup(s.players['b']!), rng)).toThrow(GameError);

    s = applyAction(s, 'a', { type: 'resolvePending', pendingId: pending.id, instanceId: pending.candidates[0]! }, rng);
    expect(s.players['a']!.roster.find((r) => r.instanceId === pending.candidates[0])!.tokens.strengthTemp).toBe(1); // 경기 전에 토큰이 있다
    expect(s.phase.kind === 'friday.prepare' && s.phase.current).toBe('b');
    expect(s.players['a']!.roster.find((r) => r.instanceId === booster.instanceId)!.exhausted).toBe(true);

    for (const id of ['b', 'c', 'd']) s = settlePending(submitLineup(s, id, autoLineup(s.players[id]!), rng), rng);
    expect(s.phase.kind).toBe('friday.aftermath');
    expect(s.players['a']!.scouted).toBe(false); // 미리 본 상대 카드는 경기로 소진
    // p.24: 경기 뒤 출전 선수의 일시적 토큰은 제거된다
    expect(s.players['a']!.roster.every((r) => r.tokens.strengthTemp === 0)).toBe(true);
  });
});

describe('경기 결과 확인 (p.24)', () => {
  it('리그 성적표: 승 +3, 무 +1(양 팀), 패 0(상대 +3)', () => {
    const s = submitAll(friday());
    if (s.phase.kind !== 'friday.aftermath') throw new Error();
    for (const id of s.seats) {
      const m = s.phase.matches[id]!;
      const expected = { win: 3, draw: 1, loss: 0 }[m.report.outcome];
      expect(s.league.players[id]).toBe(expected);
      const opp = s.league.opponents.find((o) => o.teamId === cards.opponent(m.opponentCardId).teamId)!;
      expect(opp.position).toBeGreaterThanOrEqual({ win: 0, draw: 1, loss: 3 }[m.report.outcome]);
    }
  });

  it('상대하지 않은 팀은 주사위로 이동, 같은 팀을 2명이 상대하면 비활성', () => {
    let s = friday();
    const shared = s.players['a']!.opponentDeck[0]!;
    s.players['b']!.opponentDeck[0] = shared;
    s = submitAll(s);
    const team = cards.opponent(shared).teamId;
    expect(s.league.opponents.find((o) => o.teamId === team)!.active).toBe(false);
    const facedTeams = new Set(s.seats.map((id) => cards.opponent((s.phase as { matches: Record<string, { opponentCardId: string }> }).matches[id]!.opponentCardId).teamId));
    const unfaced = s.league.opponents.filter((o) => !facedTeams.has(o.teamId));
    expect(unfaced.length).toBeGreaterThan(0);
    expect(unfaced.every((o) => o.active)).toBe(true);
  });

  it('유망주 출전 경력 칸에 승점 (p.16)', () => {
    let s = friday();
    const p = s.players['a']!;
    const prospect = p.roster.find((r) => cards.player(r.cardId).kind === 'prospect')!;
    prospect.trained = true;
    const card = cards.player(prospect.cardId);
    s = submitAll(s);
    const after = s.players['a']!.roster.find((r) => r.instanceId === prospect.instanceId)!;
    if ((card.trained.career?.appearances ?? 0) > 0) expect(after.careerVP).toBeGreaterThanOrEqual(1);
    expect(after.careerUsed.appearances).toBe(Math.min(1, card.trained.career?.appearances ?? 0));
  });

  it('경기 영향 주사위: 굴림 → (팬덤 재굴림) → 수락, 전원 수락 시 주말', () => {
    let s = submitAll(friday());
    expect(() => acceptMatchRoll(s, 'a', seededRng())).toThrow(GameError);
    s = rollMatchDie(s, 'a', seededRng(5));
    expect(() => rollMatchDie(s, 'a', seededRng())).toThrow(GameError);
    s.players['a']!.resources.fandom = 1;
    s = rerollMatchDie(s, 'a', seededRng(6));
    expect(s.players['a']!.resources.fandom).toBe(0);
    expect(() => rerollMatchDie(s, 'a', seededRng())).toThrow(GameError);
    for (const id of s.seats) {
      if (id !== 'a') s = rollMatchDie(s, id, seededRng(id.charCodeAt(0)));
      s = acceptMatchRoll(s, id, seededRng(3));
    }
    expect(s.phase.kind).toBe('monday.board');
    expect(s.week).toBe(2);
  });

  it('주사위 결과는 승/무/패 표를 따른다 (승리 6 팬덤, 5 훈련, 4 역량, 3 약점, 2 부상, 1 심각한 부상)', () => {
    const base = submitAll(friday());
    const withRoll = (roll: number, outcome: 'win' | 'draw' | 'loss' = 'win') => {
      const s = structuredClone(base);
      if (s.phase.kind !== 'friday.aftermath') throw new Error();
      s.phase.matches['a']!.roll = roll;
      s.phase.matches['a']!.report.outcome = outcome;
      return s;
    };
    const p = (s: GameState) => s.players['a']!;

    expect(p(acceptMatchRoll(withRoll(6), 'a', seededRng())).tracks.fandom).toBe(p(base).tracks.fandom + 1);

    const trained = acceptMatchRoll(withRoll(5), 'a', seededRng());
    expect(p(trained).pending.length + p(trained).roster.filter((r) => r.trained).length).toBeGreaterThan(p(base).roster.filter((r) => r.trained).length);

    const strength = acceptMatchRoll(withRoll(4), 'a', seededRng());
    expect(p(strength).pending.some((x) => x.effect.type === 'addPlayerToken' && x.effect.token === 'strengthTemp')).toBe(true);
    const weakness = acceptMatchRoll(withRoll(3), 'a', seededRng());
    expect(p(weakness).pending.some((x) => x.effect.type === 'addPlayerToken' && x.effect.token === 'weaknessTemp')).toBe(true);

    for (const [roll, outcome, times] of [[2, 'win', 1], [1, 'win', 1], [1, 'draw', 2], [1, 'loss', 2]] as const) {
      const s = acceptMatchRoll(withRoll(roll, outcome), 'a', seededRng(11));
      expect(s.log.filter((l) => l.text.includes('부상 주사위'))).toHaveLength(times);
    }
    // 패배 6은 승리 4와 같은 일시 역량
    expect(p(acceptMatchRoll(withRoll(6, 'loss'), 'a', seededRng())).pending.some((x) => x.effect.type === 'addPlayerToken' && x.effect.token === 'strengthTemp')).toBe(true);
  });
});

// 온라인 구현의 확정 사항: 라인업 제출과 경기 영향 주사위도 선 참가자부터 한 명씩 진행한다
describe('금요일 차례 (턴제)', () => {
  it('라인업은 현재 차례의 참가자만 제출할 수 있다', () => {
    let s = friday();
    if (s.phase.kind !== 'friday.prepare') throw new Error();
    expect(s.phase.current).toBe('a');
    expect(() => submitLineup(s, 'b', autoLineup(s.players['b']!), seededRng())).toThrow('not your turn');
    s = submitLineup(s, 'a', autoLineup(s.players['a']!), seededRng());
    if (s.phase.kind !== 'friday.prepare') throw new Error();
    expect(s.phase.current).toBe('b');
  });

  it('경기 영향 주사위도 차례를 따르고, 마지막 참가자가 적용하면 주말로 넘어간다', () => {
    let s = submitAll(friday());
    if (s.phase.kind !== 'friday.aftermath') throw new Error();
    expect(s.phase.current).toBe('a');
    expect(() => rollMatchDie(s, 'd', seededRng())).toThrow('not your turn');
    for (const id of ['a', 'b', 'c', 'd']) {
      if (s.phase.kind !== 'friday.aftermath') throw new Error();
      expect(s.phase.current).toBe(id);
      s = acceptMatchRoll(rollMatchDie(s, id, seededRng(2)), id, seededRng(3));
    }
    expect(s.phase.kind).toBe('monday.board');
    if (s.phase.kind !== 'monday.board') throw new Error();
    // 주말에 선 참가자가 b 로 바뀌었으므로 다음 이사회는 b 부터
    expect(s.firstPlayer).toBe('b');
    expect(s.phase.current).toBe('b');
  });
});
