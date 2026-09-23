import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { activeSide, cards, effectiveSkill, instanceName, tokenLabel } from './cards';
import { addToRoster, applyEffects } from './effects';
import { eligiblePlayers, previewField } from './lineup';
import { acceptInjuryRoll, acceptMatchRoll, playTacticEffect, rerollInjuryDie, rerollMatchDie, rollInjuryDie, rollMatchDie, standsCount, startFriday, submitLineup } from './friday';
import { GameError } from './state';
import type { GameState } from './state';
import { applyMatchRoll, autoLineup, gameAtMonday, seededRng, settlePending, skipTacticEffects } from './test-utils';
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
  it('경기 결과에 배치와 득점자를 남긴다: 득점 토큰마다 "이름(번호)" 또는 "유니폼 N번" (test_insight C3)', () => {
    for (const seed of [1, 2, 3]) {
      const s = submitAll(friday(), seed);
      if (s.phase.kind !== 'friday.aftermath') throw new Error();
      for (const id of s.seats) {
        const m = s.phase.matches[id]!;
        const p = s.players[id]!;
        expect(Object.keys(m.placements).sort()).toEqual(p.uniforms.filter((u) => u.location === 'field').map((u) => u.id).sort());
        const labels = m.report.scorers.map((t) => tokenLabel(p, m.played, t));
        for (const l of labels) expect(l).toMatch(/\(\d+번\)$|\(번호 없음\)$|^유니폼 /);
        const logged = s.log.some((e) => e.actor === id && e.text === `[경기] 득점: ${labels.join(' · ')}`);
        expect(logged).toBe(labels.length > 0);
      }
    }
  });

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
    expect(s.players['a']!.matchHistory).toMatchObject([{ week: s.week }]); // 목표 카드 판정용 경기 기록 (p.27)
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

    const wrong = { ...base, placements: Object.fromEntries(Object.keys(base.placements).map((t) => [t, 'back-C' as const])) };
    expect(() => submitLineup(s, 'a', wrong, seededRng())).toThrow(GameError);
  });

  it('같은 등번호 선수 둘 중 출전시킨 쪽이 토큰을 쓴다 (사용자 제보 2026-09-22: 나중에 영입한 쪽만 토큰과 연결돼 있었다)', () => {
    const s = friday();
    const p = s.players['a']!;
    const a = p.roster.find((r) => !activeSide(r).goalkeeper && activeSide(r).number !== undefined && activeSide(r).number! <= 11)!;
    const b = addToRoster(p, a.cardId); // 같은 카드 = 같은 등번호. 영입 시점의 토큰 연결은 b
    const token = p.uniforms.find((u) => u.number === activeSide(a).number)!;
    expect(token.cardInstanceId).toBe(b.instanceId);

    const played = eligiblePlayers(p); // 번호 중복은 먼저 온 a 만 출전
    expect(played).toContain(a.instanceId);
    expect(played).not.toContain(b.instanceId);
    // 미리보기(클라이언트·봇)도 출전 선수 기준으로 토큰을 연결한다
    expect(previewField(p, played).find((u) => u.id === token.id)!.cardInstanceId).toBe(a.instanceId);

    let next = submitLineup(s, 'a', autoLineup(p, played), seededRng());
    const after = next.players['a']!.uniforms.find((u) => u.id === token.id)!;
    expect(after.cardInstanceId).toBe(a.instanceId);
    expect(after.face).toBe(activeSide(a).role);
    for (const id of ['b', 'c', 'd']) next = settlePending(submitLineup(next, id, autoLineup(next.players[id]!), seededRng()), seededRng());
    next = skipTacticEffects(next, seededRng());
    if (next.phase.kind !== 'friday.aftermath') throw new Error();
    const m = next.phase.matches['a']!;
    expect(m.skills[token.id]).toBe(effectiveSkill(a)); // 카드 없는 토큰(역량 1)이 아니라 a 의 역량으로 판정
    expect(tokenLabel(next.players['a']!, m.played, token.id)).toContain(instanceName(a));
  });

  it('9지역 배치 (p.20): 라인별 인원 = 포메이션(수비-미드-공격), 센터 지역 1~3, 윙 지역 최대 1 — 라인 안에서 나누는 방법은 참가자가 고른다', () => {
    const s = friday();
    const p = s.players['a']!;
    const base = autoLineup(p, []); // 선수 카드 없이 토큰만 — 허용 구획 제약 없이 지역 규칙만 본다
    const formation = cards.tactic(base.tacticCardId).formations[base.formationIndex]!;
    const inLine = (pl: typeof base.placements, line: string) => Object.values(pl).filter((r) => r.startsWith(line)).length;
    expect([inLine(base.placements, 'back'), inLine(base.placements, 'mid'), inLine(base.placements, 'fwd')]).toEqual([formation.defenders, formation.midfielders, formation.forwards]);
    expect(() => submitLineup(s, 'a', base, seededRng())).not.toThrow();

    const tokensAt = (region: string) => Object.keys(base.placements).filter((t) => base.placements[t] === region);
    const move = (tokenId: string, region: (typeof base.placements)[string]) => ({ ...base, placements: { ...base.placements, [tokenId]: region } });
    // 수비 라인(4명 이상)은 센터 3 + 윙으로 자동 배치된다. 센터의 한 명을 비어 있는 윙으로 옮겨도(센터 2 + 양 윙) 유효하다
    expect(formation.defenders).toBeGreaterThanOrEqual(4);
    const backCenter = tokensAt('back-C');
    const emptyWing = (['back-L', 'back-R'] as const).find((r) => tokensAt(r).length === 0);
    if (emptyWing) expect(() => submitLineup(s, 'a', move(backCenter[0]!, emptyWing), seededRng())).not.toThrow();
    // 윙 지역에는 1명까지
    const fullWing = (['back-L', 'back-R'] as const).find((r) => tokensAt(r).length === 1)!;
    expect(() => submitLineup(s, 'a', move(backCenter[0]!, fullWing), seededRng())).toThrow('formation mismatch');
    // 라인 인원이 포메이션과 다르면 거부 (수비 한 명을 미드로)
    expect(() => submitLineup(s, 'a', move(backCenter[0]!, 'mid-C'), seededRng())).toThrow('formation mismatch');
    // 센터 지역을 비울 수 없다 (공격 라인의 센터를 모두 윙으로)
    const fwdCenter = tokensAt('fwd-C');
    if (fwdCenter.length === 1 && tokensAt('fwd-L').length === 0) expect(() => submitLineup(s, 'a', move(fwdCenter[0]!, 'fwd-L'), seededRng())).toThrow('formation mismatch');
    // 없는 지역 이름
    expect(() => submitLineup(s, 'a', move(backCenter[0]!, 'CB' as never), seededRng())).toThrow('invalid region');
  });

  it('골키퍼는 1명만 출전한다 — 등번호 없는 훈련 전 유망주 골키퍼도 포함 (사용자 제보 2026-09)', () => {
    const s = friday();
    const p = s.players['a']!;
    p.roster = p.roster.filter((r) => !activeSide(r).goalkeeper);
    const starter = addToRoster(p, 'p-s33'); // 주전 골키퍼 (1번)
    const prospect = addToRoster(p, 'p-p19'); // 유망주 골키퍼 (훈련 전, 등번호 없음)
    expect(activeSide(prospect).number).toBeUndefined();
    // 도우미는 골키퍼를 한 명만 고른다
    const picked = autoLineup(p).players.filter((id) => [starter.instanceId, prospect.instanceId].includes(id));
    expect(picked).toEqual([starter.instanceId]);
    // 둘 다 넣어 제출하면 엔진이 거부한다
    const both = autoLineup(p, [starter.instanceId, prospect.instanceId]);
    expect(() => submitLineup(s, 'a', { ...both, players: [starter.instanceId, prospect.instanceId] }, seededRng())).toThrow('only one goalkeeper can play');
    expect(() => submitLineup(s, 'a', autoLineup(p, [prospect.instanceId]), seededRng())).not.toThrow();
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

  it('부상 제거 선수 효과는 경기 후에 적용된다: 벤치의 부상 선수가 다음 경기에 더 빨리 돌아온다 (배수아 p-p08)', () => {
    const rng = seededRng(3);
    let s = friday();
    const a = s.players['a']!;
    const medic = addToRoster(a, 'p-p08');
    medic.trained = true;
    assignUniform(a.uniforms, medic.instanceId, activeSide(medic));
    const injured = addToRoster(a, 'p-s02');
    injured.tokens.injury = 3;
    const players = autoLineup(a).players.filter((id) => id !== injured.instanceId);
    if (!players.includes(medic.instanceId)) players.push(medic.instanceId);
    s = settlePending(submitLineup(s, 'a', autoLineup(a, players), rng), rng);
    expect(s.players['a']!.roster.find((r) => r.instanceId === injured.instanceId)!.tokens.injury).toBe(2); // 경기 준비의 자동 −1 (p.20 4)만
    for (const id of ['b', 'c', 'd']) s = settlePending(submitLineup(s, id, autoLineup(s.players[id]!), rng), rng);
    s = settlePending(skipTacticEffects(s, rng), rng);
    expect(s.phase.kind).toBe('friday.aftermath');
    expect(s.players['a']!.roster.find((r) => r.instanceId === injured.instanceId)!.tokens.injury).toBe(1); // 경기 후 효과로 1개 더
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

  // 전술 효과 카드 점검용: a 에게 능력 없는 공격 선수 2명(CF/LW 역량 2, CM/RW 역량 1)을 더해 라인업을 낸 경기 진행 단계
  function withAttackers(seed = 7): GameState {
    const rng = seededRng(seed);
    let s = friday();
    addToRoster(s.players['a']!, 'p-s20');
    addToRoster(s.players['a']!, 'p-s21');
    for (const id of s.seats) s = settlePending(submitLineup(s, id, autoLineup(s.players[id]!), rng), rng);
    expect(s.phase.kind).toBe('friday.match');
    return s;
  }
  const aftermath = (st: GameState) => (st.phase.kind === 'friday.aftermath' ? st.phase.matches['a']! : null)!;
  const playCard = (st: GameState, cardId: string) => {
    const copy = structuredClone(st);
    copy.players['a']!.tacticCards.push(cardId);
    return playTacticEffect(copy, 'a', cardId, seededRng(1));
  };

  it('역습(tc-07): 출전 중인 [공격] 선수 카드만 후보, 고른 선수의 역량 +1 이 그 경기 판정에 쓰이고 경기 후 버려진다', () => {
    const base = withAttackers();
    const a = base.players['a']!;
    const sub = base.phase.kind === 'friday.match' ? base.phase.submitted['a']! : null;
    const attackers = a.roster.filter((r) => sub!.players.includes(r.instanceId) && activeSide(r).role === 'attack');
    expect(attackers.length).toBeGreaterThanOrEqual(2);
    const target = a.roster.find((r) => r.cardId === 'p-s20')!;
    const token = a.uniforms.find((u) => u.cardInstanceId === target.instanceId)!;
    const plain = aftermath(skipTacticEffects(structuredClone(base), seededRng(1)));
    expect(plain.skills[token.id]).toBe(2);
    expect(plain.effectCard).toBeNull();

    let s = playCard(base, 'tc-07');
    const pending = s.players['a']!.pending;
    expect(pending.length).toBe(1);
    expect([...pending[0]!.candidates].sort()).toEqual(attackers.map((r) => r.instanceId).sort());
    expect(s.phase.kind === 'friday.match' && s.phase.current).toBe('a'); // 대상을 고를 때까지 차례 유지
    s = applyAction(s, 'a', { type: 'resolvePending', pendingId: pending[0]!.id, choice: target.instanceId }, seededRng(1));
    expect(s.players['a']!.roster.find((r) => r.instanceId === target.instanceId)!.tokens.strengthTemp).toBe(1);
    expect(s.phase.kind === 'friday.match' && s.phase.current).toBe('b');
    const after = skipTacticEffects(s, seededRng(1));
    const done = aftermath(after);
    expect(done.skills[token.id]).toBe(3); // 판정에 쓴 역량
    expect(done.effectCard).toBe('tc-07');
    expect(done.report.myGoals).toBeGreaterThanOrEqual(plain.report.myGoals);
    expect(after.players['a']!.roster.find((r) => r.instanceId === target.instanceId)!.tokens.strengthTemp).toBe(0);
  });

  it('역습(tc-07): 출전 중인 [공격] 선수 카드가 없으면 효과 없음을 기록하고, 1명이면 바로 적용하고 기록한다', () => {
    const rng = seededRng(7);
    const s = friday();
    const a = s.players['a']!;
    const sole = addToRoster(a, 'p-s20');
    const others = a.roster.filter((r) => r !== sole && activeSide(r).role === 'attack').map((r) => r.instanceId);
    const toMatch = (exclude: string[]) => {
      let st = structuredClone(s);
      const pa = st.players['a']!;
      st = settlePending(submitLineup(st, 'a', autoLineup(pa, pa.roster.map((r) => r.instanceId).filter((id) => !exclude.includes(id))), rng), rng);
      for (const id of ['b', 'c', 'd']) st = settlePending(submitLineup(st, id, autoLineup(st.players[id]!), rng), rng);
      return playCard(st, 'tc-07');
    };
    const none = toMatch([sole.instanceId, ...others]);
    expect(none.players['a']!.pending).toEqual([]);
    expect(none.players['a']!.roster.every((r) => r.tokens.strengthTemp === 0)).toBe(true);
    expect(none.log.some((e) => e.actor === 'a' && e.text.startsWith('[전술] 역습:') && e.text.includes('효과 없음'))).toBe(true);

    const one = toMatch(others);
    expect(one.players['a']!.pending).toEqual([]);
    expect(one.players['a']!.roster.find((r) => r.instanceId === sole.instanceId)!.tokens.strengthTemp).toBe(1);
    expect(one.log.some((e) => e.actor === 'a' && e.text.includes('토마스 린드에 바로 적용'))).toBe(true);
  });

  it('토탈 풋볼(tc-08): 센터 미드필더 구획의 모든 토큰 역량 +1, 다른 구획은 그대로', () => {
    const base = withAttackers();
    const plain = aftermath(skipTacticEffects(structuredClone(base), seededRng(1)));
    const done = aftermath(skipTacticEffects(playCard(base, 'tc-08'), seededRng(1)));
    const cm = Object.keys(plain.skills).filter((t) => plain.placements[t] === 'mid-C');
    expect(cm.length).toBeGreaterThan(0);
    for (const t of Object.keys(plain.skills)) expect(done.skills[t]).toBe(plain.skills[t]! + (cm.includes(t) ? 1 : 0));
  });

  it('잃을 게 없어(tc-05): 상대 팀이 리그에서 나보다 위일 때만 +1골', () => {
    const base = withAttackers();
    const plain = aftermath(skipTacticEffects(structuredClone(base), seededRng(1)));
    expect(aftermath(skipTacticEffects(playCard(base, 'tc-05'), seededRng(1))).report.myGoals).toBe(plain.report.myGoals); // 1주차: 같은 위치
    const higher = structuredClone(base);
    const teamId = cards.opponent(higher.players['a']!.opponentDeck[0]!).teamId;
    higher.league.opponents.find((o) => o.teamId === teamId)!.position = 4;
    expect(aftermath(skipTacticEffects(playCard(higher, 'tc-05'), seededRng(1))).report.myGoals).toBe(plain.report.myGoals + 1);
  });

  it('리베로(tc-06): 카드 없는 필드 토큰 1개를 골라 공격↔수비로 뒤집는다', () => {
    const base = withAttackers();
    let s = playCard(base, 'tc-06');
    const pending = s.players['a']!.pending[0]!;
    expect(pending.target).toBe('token');
    const free = base.players['a']!.uniforms.filter((u) => u.location === 'field' && !u.cardInstanceId).map((u) => u.id);
    expect([...pending.candidates].sort()).toEqual([...free].sort());
    const before = base.players['a']!.uniforms.find((u) => u.id === pending.candidates[0])!.face;
    s = applyAction(s, 'a', { type: 'resolvePending', pendingId: pending.id, choice: pending.candidates[0]! }, seededRng(1));
    expect(s.players['a']!.uniforms.find((u) => u.id === pending.candidates[0])!.face).not.toBe(before);
    expect(skipTacticEffects(s, seededRng(1)).phase.kind).toBe('friday.aftermath');
  });

  it('티키타카(tc-11): 센터 미드필더 구획에서 득점했을 때만 +1골 / 세트피스(tc-12): +1골과 체력 −1', () => {
    const base = withAttackers();
    const plain = aftermath(skipTacticEffects(structuredClone(base), seededRng(1)));
    const cmGoals = plain.report.sectors.find((x) => x.mine === 'CM')!.myGoals;
    expect(aftermath(skipTacticEffects(playCard(base, 'tc-11'), seededRng(1))).report.myGoals).toBe(plain.report.myGoals + (cmGoals > 0 ? 1 : 0));
    // CM 구획에서 반드시 득점하게 만들면 +1
    const strong = structuredClone(base);
    if (strong.phase.kind === 'friday.match') strong.phase.preMatch['a']!.sectorSkill = { CM: 9 };
    const strongPlain = aftermath(skipTacticEffects(structuredClone(strong), seededRng(1)));
    expect(strongPlain.report.sectors.find((x) => x.mine === 'CM')!.myGoals).toBeGreaterThan(0);
    expect(aftermath(skipTacticEffects(playCard(strong, 'tc-11'), seededRng(1))).report.myGoals).toBe(strongPlain.report.myGoals + 1);

    const stamina = base.players['a']!.resources.stamina;
    const setPiece = playCard(base, 'tc-12');
    expect(setPiece.players['a']!.resources.stamina).toBe(Math.max(0, stamina - 1));
    expect(aftermath(skipTacticEffects(setPiece, seededRng(1))).report.myGoals).toBe(plain.report.myGoals + 1);
  });

  it('출전 공격수 한정 대상 선택이 둘 남아 있을 때 하나를 고르면 나머지가 말없이 사라지지 않는다', () => {
    const s = withAttackers();
    const a = s.players['a']!;
    const played = s.phase.kind === 'friday.match' ? s.phase.submitted['a']!.players : [];
    const boost = [{ type: 'addPlayerToken', token: 'strengthTemp', count: 1, only: 'playedAttack' }] as const;
    applyEffects(s, 'a', boost, '시험1', { played }, seededRng(1));
    applyEffects(s, 'a', boost, '시험2', { played }, seededRng(1));
    expect(a.pending.length).toBe(2);
    const next = applyAction(s, 'a', { type: 'resolvePending', pendingId: a.pending[0]!.id, choice: a.pending[0]!.candidates[0]! }, seededRng(1));
    expect(next.players['a']!.pending.length).toBe(1);
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
    expect(s.log.some((l) => l.text.includes('같은 상대') && l.text.includes('비활성'))).toBe(true); // 왜 비활성이 됐는지 기록에 남긴다
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
      s = applyMatchRoll(s, id, seededRng(3));
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
      // 부상류는 바로 처리하지 않고 12면체 부상 주사위를 그만큼 굴리게 한다
      const s = acceptMatchRoll(withRoll(roll, outcome), 'a', seededRng(11));
      if (s.phase.kind !== 'friday.aftermath') throw new Error();
      expect(s.phase.matches['a']!.injuryDice.map((d) => d.count)).toEqual(Array(times).fill(roll === 1 && outcome !== 'draw' ? 2 : 1));
      expect(s.phase.matches['a']!.decided).toBe(false);
      expect(s.phase.current).toBe('a');
    }
    // 패배 6은 승리 4와 같은 일시 역량
    expect(p(acceptMatchRoll(withRoll(6, 'loss'), 'a', seededRng())).pending.some((x) => x.effect.type === 'addPlayerToken' && x.effect.token === 'strengthTemp')).toBe(true);
  });

  it('부상 주사위(12면체, p.24·p.27): 참가자가 굴림 → 팬덤 재굴림 → 적용. 눈과 같은 등번호의 출전 선수가 부상, 없으면 아무 일도 없음', () => {
    let s = submitAll(friday());
    if (s.phase.kind !== 'friday.aftermath') throw new Error();
    s.phase.matches['a']!.roll = 1; // 승리 1 = 심각한 부상(2개), 무승부 1 = 두 번의 부상
    s.phase.matches['a']!.report.outcome = 'draw';
    expect(() => rollInjuryDie(s, 'a', seededRng())).toThrow(GameError); // 경기 영향을 적용하기 전에는 굴릴 수 없다
    s = acceptMatchRoll(s, 'a', seededRng());
    expect(() => acceptMatchRoll(s, 'a', seededRng())).toThrow(GameError);
    expect(() => rerollMatchDie(s, 'a', seededRng())).toThrow(GameError); // 적용한 6면체는 다시 굴릴 수 없다
    expect(() => acceptInjuryRoll(s, 'a', seededRng())).toThrow(GameError); // 먼저 굴려야 한다
    expect(() => rollInjuryDie(s, 'b', seededRng())).toThrow('not your turn');

    s = rollInjuryDie(s, 'a', seededRng(1));
    expect(() => rollInjuryDie(s, 'a', seededRng())).toThrow(GameError);
    s.players['a']!.resources.fandom = 1;
    s = rerollInjuryDie(s, 'a', seededRng(2));
    expect(s.players['a']!.resources.fandom).toBe(0);
    expect(() => rerollInjuryDie(s, 'a', seededRng())).toThrow(GameError); // 팬덤이 없다

    // 첫 주사위: 출전 선수의 등번호가 나오게 한다 → 그 선수에 부상 1개
    if (s.phase.kind !== 'friday.aftermath') throw new Error();
    const played = s.phase.matches['a']!.played.map((id) => s.players['a']!.roster.find((r) => r.instanceId === id)!);
    const target = played.find((r) => activeSide(r).number !== undefined && activeSide(r).number! < 12)!;
    s.phase.matches['a']!.injuryDice[0]!.roll = activeSide(target).number!;
    s = acceptInjuryRoll(s, 'a', seededRng());
    expect(s.players['a']!.roster.find((r) => r.instanceId === target.instanceId)!.tokens.injury).toBe(1);
    expect(s.players['a']!.matchDieInjured).toBe(true);
    expect(s.phase.kind === 'friday.aftermath' && s.phase.current).toBe('a'); // 두 번째 주사위가 남았다

    // 두 번째 주사위: 아무도 달지 않은 번호 → 아무 일도 없음 (기록에 이유가 남는다)
    s = rollInjuryDie(s, 'a', seededRng(3));
    if (s.phase.kind !== 'friday.aftermath') throw new Error();
    const used = new Set(played.map((r) => activeSide(r).number));
    const unused = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].find((n) => !used.has(n))!;
    s.phase.matches['a']!.injuryDice[1]!.roll = unused;
    const before = s.players['a']!.roster.reduce((n, r) => n + r.tokens.injury, 0);
    s = acceptInjuryRoll(s, 'a', seededRng());
    expect(s.players['a']!.roster.reduce((n, r) => n + r.tokens.injury, 0)).toBe(before);
    expect(s.log.at(-1)!.text).toContain(`등번호 ${unused}번 출전 선수가 없어`);
    expect(s.phase.kind === 'friday.aftermath' && s.phase.matches['a']!.decided).toBe(true);
    expect(s.phase.kind === 'friday.aftermath' && s.phase.current).toBe('b');
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
      s = applyMatchRoll(rollMatchDie(s, id, seededRng(2)), id, seededRng(3));
    }
    expect(s.phase.kind).toBe('monday.board');
    if (s.phase.kind !== 'monday.board') throw new Error();
    // 주말에 선 참가자가 b 로 바뀌었으므로 다음 이사회는 b 부터
    expect(s.firstPlayer).toBe('b');
    expect(s.phase.current).toBe('b');
  });
});
