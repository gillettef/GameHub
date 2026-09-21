import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { activeSide, cards } from './cards';
import { addToRoster } from './effects';
import { acceptMatchRoll, playTacticEffect, rerollMatchDie, rollMatchDie, standsCount, startFriday, submitLineup } from './friday';
import { GameError } from './state';
import type { GameState } from './state';
import { autoLineup, gameAtMonday, seededRng, settlePending, skipTacticEffects } from './test-utils';
import { assignUniform } from './uniforms';

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
  return skipTacticEffects(s, seededRng(seed));
}

describe('경기 준비 제출 (p.20)', () => {
  it('출전 선수마다 체력 1, 관중석 팬덤 지불, 전원 제출 시 판정', () => {
    let s = friday();
    // 베테랑의 강제 경기 후 페널티(돈 −1 등)가 관중 수입 검증을 흐리지 않게, a 의 베테랑을 능력 없는 카드로 바꾼다
    for (const r of s.players['a']!.roster) {
      if (cards.player(r.cardId).kind === 'veteran') {
        r.cardId = 'p-v03';
        assignUniform(s.players['a']!.uniforms, r.instanceId, activeSide(r));
      }
    }
    const sub = { ...autoLineup(s.players['a']!), fandomInStands: 2 };
    s = submitLineup(s, 'a', sub, seededRng());
    expect(s.players['a']!.resources.stamina).toBe(6 - sub.players.length); // 출전 선수마다 체력 1
    expect(s.players['a']!.resources.fandom).toBe(1);
    expect(() => submitLineup(s, 'a', sub, seededRng())).toThrow(GameError);
    expect(s.phase.kind).toBe('friday.prepare');
    for (const id of ['b', 'c', 'd']) s = settlePending(submitLineup(s, id, autoLineup(s.players[id]!), seededRng()), seededRng());
    expect(s.phase.kind).toBe('friday.match'); // 전원 제출 → 경기 진행(전술 효과) 단계
    s = skipTacticEffects(s, seededRng());
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

  it('카드에 미리 올려놓은 체력은 출전 체력으로 1개 쓰이고(p.20 3), 남은 것은 경기 후 버린다. 미출전 선수의 것은 남는다 (p.24 4)', () => {
    let s = friday();
    const sub = autoLineup(s.players['a']!);
    const [withTwo, benched] = [sub.players[0]!, s.players['a']!.roster.find((r) => !sub.players.includes(r.instanceId))];
    s.players['a']!.roster.find((r) => r.instanceId === withTwo)!.stamina = 2;
    if (benched) benched.stamina = 1;
    s = submitLineup(s, 'a', sub, seededRng());
    expect(s.players['a']!.resources.stamina).toBe(6 - (sub.players.length - 1)); // 올려놓은 체력이 있는 선수 몫은 내지 않는다
    expect(s.players['a']!.roster.find((r) => r.instanceId === withTwo)!.stamina).toBe(1);
    s = settlePending(s, seededRng());
    for (const id of ['b', 'c', 'd']) s = settlePending(submitLineup(s, id, autoLineup(s.players[id]!), seededRng()), seededRng());
    s = skipTacticEffects(s, seededRng());
    expect(s.phase.kind).toBe('friday.aftermath');
    expect(s.players['a']!.roster.find((r) => r.instanceId === withTwo)!.stamina).toBe(0); // 출전 선수 카드 위 자원 마커는 모두 버린다
    if (benched) expect(s.players['a']!.roster.find((r) => r.instanceId === benched.instanceId)!.stamina).toBe(1); // 미출전 선수 것은 그대로
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

    s = applyAction(s, 'a', { type: 'resolvePending', pendingId: pending.id, choice: pending.candidates[0]! }, rng);
    expect(s.players['a']!.roster.find((r) => r.instanceId === pending.candidates[0])!.tokens.strengthTemp).toBe(1); // 경기 전에 토큰이 있다
    expect(s.phase.kind === 'friday.prepare' && s.phase.current).toBe('b');
    expect(s.players['a']!.roster.find((r) => r.instanceId === booster.instanceId)!.exhausted).toBe(true);

    for (const id of ['b', 'c', 'd']) s = settlePending(submitLineup(s, id, autoLineup(s.players[id]!), rng), rng);
    expect(s.phase.kind).toBe('friday.match'); // 전원 제출 → 상대 공개·전술 효과 단계
    s = skipTacticEffects(s, rng);
    expect(s.phase.kind).toBe('friday.aftermath');
    expect(s.players['a']!.scouted).toBe(false); // 미리 본 상대 카드는 경기로 소진
    // p.24: 경기 뒤 출전 선수의 일시적 토큰은 제거된다
    expect(s.players['a']!.roster.every((r) => r.tokens.strengthTemp === 0)).toBe(true);
  });
});

describe('경기 진행: 전술 효과 카드 (p.21 8, p.28)', () => {
  function toMatchPhase(seed = 5): { s: GameState; rng: ReturnType<typeof seededRng> } {
    const rng = seededRng(seed);
    let s = friday();
    for (const id of s.seats) s = settlePending(submitLineup(s, id, autoLineup(s.players[id]!), rng), rng);
    expect(s.phase.kind).toBe('friday.match');
    return { s, rng };
  }

  it('포메이션 카드는 효과로 못 쓰고, 손에 없는 카드도 거부. 카드는 손에 남는다', () => {
    const { s, rng } = toMatchPhase();
    const formation = s.phase.kind === 'friday.match' ? s.phase.submitted['a']!.tacticCardId : '';
    expect(() => playTacticEffect(s, 'a', formation, rng)).toThrow(GameError);
    expect(() => playTacticEffect(s, 'a', 'tc-09', rng)).toThrow(GameError);
    expect(() => playTacticEffect(s, 'b', null, rng)).toThrow(GameError); // 차례 아님
    s.players['a']!.tacticCards.push('tc-09');
    const next = playTacticEffect(s, 'a', 'tc-09', rng);
    expect(next.players['a']!.tacticCards).toContain('tc-09');
    expect(next.phase.kind === 'friday.match' && next.phase.effectCard['a']).toBe('tc-09');
    expect(next.phase.kind === 'friday.match' && next.phase.current).toBe('b');
  });

  it('버스 세우기(상대 득점 1 무효)·토탈 풋볼(CM 역량 +1)·선방 추가가 경기 판정에 반영된다', () => {
    const base = toMatchPhase(11);
    // 기준: 아무 효과 없이
    const plain = skipTacticEffects(base.s, seededRng(1));
    const report = (st: GameState) => (st.phase.kind === 'friday.aftermath' ? st.phase.matches['a']!.report : null)!;
    const raw = report(plain);

    // 버스 세우기: 상대 득점이 있었다면 1 줄어든다
    const bus = structuredClone(base.s);
    bus.players['a']!.tacticCards.push('tc-09');
    const withBus = report(skipTacticEffects(playTacticEffect(bus, 'a', 'tc-09', seededRng(1)), seededRng(1)));
    expect(withBus.theirGoals).toBe(Math.max(0, raw.theirGoals - 1));
    expect(withBus.myGoals).toBe(raw.myGoals);

    // 선방 +2 를 mods 에 직접 넣으면 상대 득점이 늘지 않는다 (골키퍼 역량 ≥ 슛이면 막는다)
    const saves = structuredClone(base.s);
    if (saves.phase.kind === 'friday.match') saves.phase.preMatch['a']!.extraSaves = 2;
    const withSaves = report(skipTacticEffects(saves, seededRng(1)));
    expect(withSaves.theirGoals).toBeLessThanOrEqual(raw.theirGoals);

    // CM 구획 역량 +3 이면 내 득점은 줄지 않는다
    const total = structuredClone(base.s);
    if (total.phase.kind === 'friday.match') total.phase.preMatch['a']!.sectorSkill = { CM: 3 };
    const withTotal = report(skipTacticEffects(total, seededRng(1)));
    expect(withTotal.myGoals).toBeGreaterThanOrEqual(raw.myGoals);
  });

  it('조건부 효과: 경기 후 조건(실점 없음 등)은 판정 뒤에 적용되고, 상시 효과 승리 팬덤도 붙는다', () => {
    const { s, rng } = toMatchPhase(3);
    const a = s.players['a']!;
    a.tacticCards.push('tc-10'); // 팬덤 +1, 상대 무득점이면 돈 +1
    a.passives.push({ passive: 'fandomOnWin', source: 't' });
    const fandom = a.resources.fandom;
    const money = a.resources.money;
    const stands = s.phase.kind === 'friday.match' ? (s.phase.submitted['a']!.fandomInStands ?? 0) : 0;
    // 출전 선수 카드의 강제 경기 후 자원 증감(베테랑 페널티 등)은 카드 데이터에 따라 달라지므로 기대값에 반영한다
    const played = s.phase.kind === 'friday.match' ? s.phase.submitted['a']!.players : [];
    const mandatory = (resource: 'fandom' | 'money') =>
      a.roster
        .filter((r) => played.includes(r.instanceId))
        .map((r) => activeSide(r).effect)
        .filter((e) => e && e.timing === 'afterMatch' && e.mandatory)
        .flatMap((e) => e!.effects)
        .reduce((n, e) => (e.type === 'gainResource' && e.resource === resource ? n + e.amount : n), 0);
    const done = skipTacticEffects(playTacticEffect(s, 'a', 'tc-10', rng), rng);
    const r = done.phase.kind === 'friday.aftermath' ? done.phase.matches['a']!.report : null;
    expect(r).not.toBeNull();
    const pa = done.players['a']!;
    expect(pa.resources.fandom).toBe(Math.max(0, fandom + 1 + (r!.outcome === 'win' ? 1 : 0) + mandatory('fandom')));
    expect(pa.resources.money).toBe(Math.max(0, money + stands + (r!.theirGoals === 0 ? 1 : 0) + mandatory('money')));
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
