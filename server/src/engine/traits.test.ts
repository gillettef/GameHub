import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { cards } from './cards';
import { redrawTactic, rerollMatchDie, rollMatchDie, startFriday, submitLineup } from './friday';
import { rerollBoardDie, rollBoardDie } from './monday';
import { GameError } from './state';
import type { GameState } from './state';
import { autoLineup, gameAtMonday, seededRng, settlePending, skipTacticEffects } from './test-utils';
import { hireCost, infraCost, lineupStaminaCost, marketMinIndex, prospectCost, traitsOf } from './traits';
import { buildInfrastructure, hireStaff, recruitPlayer, recruitProspect, signSponsor, startWeekday } from './weekday';
import { runWeekend, upkeepDue } from './weekend';

// 어느 단계에서든 주말 처리를 한 번 돌린 복사본 (주당 1회 제한의 초기화 확인용)
function weekendFrom(s: GameState): GameState {
  const copy = structuredClone(s);
  runWeekend(copy, seededRng(7));
  return copy;
}

// 임원·직원 특성(p.28: 출장정지 카드의 특성은 무효)
function withExec(s: GameState, pid: string, cardId: string): void {
  s.players[pid]!.executives.push({ cardId, exhausted: false });
}
function withStaff(s: GameState, pid: string, cardId: string, suspension = 0): void {
  s.players[pid]!.staff.push({ cardId, exhausted: false, suspension });
}
function tuesday(): GameState {
  const s = gameAtMonday();
  startWeekday(s);
  for (const id of s.seats) {
    s.players[id]!.resources = { money: 10, fandom: 2, ops: 2, stamina: 2 };
    s.players[id]!.pending = [];
  }
  return s;
}

describe('특성 (임원·직원 지속 효과)', () => {
  it('신유나(ex-13): 이사회 주사위 재굴림에 팬덤을 내지 않는다 — 주당 1회, 그 뒤로는 팬덤을 낸다', () => {
    const rng = seededRng(2);
    const s = gameAtMonday();
    const pid = s.firstPlayer;
    s.players[pid]!.resources.fandom = 1;
    const rolled = rollBoardDie(s, pid, rng);
    const plain = rerollBoardDie(rolled, pid, rng);
    expect(plain.players[pid]!.resources.fandom).toBe(0);

    withExec(rolled, pid, 'ex-13');
    const free = rerollBoardDie(rolled, pid, rng);
    expect(free.players[pid]!.resources.fandom).toBe(1);
    expect(free.players[pid]!.freeRerollUsed.board).toBe(true);
    expect(free.log[free.log.length - 1]!.text).toContain('팬덤 없이');
    // 팬덤이 0이어도 된다
    rolled.players[pid]!.resources.fandom = 0;
    expect(() => rerollBoardDie(rolled, pid, rng)).not.toThrow();
    // 이번 주 무료 재굴림을 썼으면 두 번째부터는 팬덤 1개 (사용자 결정, 2026-09)
    const second = rerollBoardDie(free, pid, rng);
    expect(second.players[pid]!.resources.fandom).toBe(0);
    free.players[pid]!.resources.fandom = 0;
    expect(() => rerollBoardDie(free, pid, rng)).toThrow(GameError);
    // 주말이 지나면 다시 무료
    const p = free.players[pid]!;
    p.freeRerollUsed = { board: true, match: true };
    const weekend = weekendFrom(free);
    expect(weekend.players[pid]!.freeRerollUsed).toEqual({ board: false, match: false });
  });

  it('st-11: 경기 영향 주사위 무료 재굴림도 주당 1회', () => {
    const rng = seededRng(3);
    let s = gameAtMonday();
    startFriday(s);
    for (const id of s.seats) {
      s.players[id]!.resources = { money: 5, fandom: 2, ops: 2, stamina: 6 };
      s.players[id]!.pending = [];
      s = settlePending(submitLineup(s, id, autoLineup(s.players[id]!), rng), rng);
    }
    s = skipTacticEffects(s, rng);
    const pid = s.firstPlayer;
    withStaff(s, pid, 'st-11');
    const fandom = s.players[pid]!.resources.fandom;
    s = rollMatchDie(s, pid, rng);
    s = rerollMatchDie(s, pid, rng);
    expect(s.players[pid]!.resources.fandom).toBe(fandom); // 무료
    expect(s.players[pid]!.freeRerollUsed.match).toBe(true);
    s = rerollMatchDie(s, pid, rng);
    expect(s.players[pid]!.resources.fandom).toBe(fandom - 1); // 두 번째는 팬덤
  });

  it('비용 할인: 건설(ex-03)·고용(ex-11)·유망주(st-19), 출장정지 직원의 특성은 무효', () => {
    const s = tuesday();
    // 드래프트로 이미 같은 특성의 임원을 들고 있을 수 있으므로 기준값 대비 1씩 줄어드는지 본다
    const base = { infra: infraCost(s.players['a']!), hire: hireCost(s.players['a']!, 3), prospect: prospectCost(s.players['a']!, 2) };
    withExec(s, 'a', 'ex-03');
    withExec(s, 'a', 'ex-11');
    withStaff(s, 'a', 'st-19');
    expect(infraCost(s.players['a']!)).toBe(Math.max(0, base.infra - 1));
    expect(hireCost(s.players['a']!, 3)).toBe(Math.max(0, base.hire - 1));
    expect(prospectCost(s.players['a']!, 2)).toBe(Math.max(0, base.prospect - 1));
    const built = buildInfrastructure(s, 'a', 'shop');
    expect(built.players['a']!.resources.money).toBe(10 - infraCost(s.players['a']!));
    // 같은 시장·같은 카드를 추가 특성 없이 고용한 경우보다 할인 차이만큼 덜 든다 (비용은 0 아래로 내려가지 않고, 카드 보너스는 양쪽 동일)
    const plainState = tuesday();
    const cardCost = cards.staff(s.market.staff[4]!).cost;
    const hired = hireStaff(s, 'a', 4, seededRng());
    const plain = hireStaff(plainState, 'a', 4, seededRng());
    expect(hired.players['a']!.resources.money).toBe(plain.players['a']!.resources.money + hireCost(plainState.players['a']!, cardCost) - hireCost(s.players['a']!, cardCost));
    const prospect = recruitProspect(s, 'a');
    // 유망주 비용 1 − 할인 1 = 0
    expect(prospect.players['a']!.resources.money).toBe(10 - prospectCost(s.players['a']!, cards.player(s.decks.prospects[0]!).untrained.cost));

    s.players['a']!.staff.find((x) => x.cardId === 'st-19')!.suspension = 1;
    expect(prospectCost(s.players['a']!, 2)).toBe(base.prospect);
    expect(traitsOf(s.players['a']!).some((t) => t.kind === 'prospectDiscount')).toBe(false);
  });

  it('시장 맨 왼쪽 2장 선택(st-18 선수, st-33 스폰서)과 스폰서 계약 팬덤(ex-16)', () => {
    const s = tuesday();
    expect(() => recruitPlayer(s, 'a', 0, seededRng())).toThrow(GameError);
    withStaff(s, 'a', 'st-18');
    expect(marketMinIndex(s.players['a']!, 'players')).toBe(0);
    expect(marketMinIndex(s.players['a']!, 'sponsors')).toBe(2);
    s.players['a']!.resources.money = 20;
    expect(recruitPlayer(s, 'a', 0, seededRng()).players['a']!.roster.length).toBe(s.players['a']!.roster.length + 1);

    // 같은 카드를 같은 유형으로 계약했을 때, ex-16 이 있으면 팬덤이 1 더 많다 (카드 효과의 팬덤 증감은 양쪽 동일)
    const t = tuesday();
    withStaff(t, 'a', 'st-33');
    const plain = signSponsor(t, 'a', 0, 'kit', seededRng()); // 맨 왼쪽 카드도 특성으로 선택 가능
    withExec(t, 'a', 'ex-16');
    const boosted = signSponsor(t, 'a', 0, 'kit', seededRng());
    expect(boosted.players['a']!.resources.fandom).toBe(plain.players['a']!.resources.fandom + 1);
  });

  it('출전 체력 면제(ex-07)·유지비 할인(st-25)', () => {
    const s = tuesday();
    withExec(s, 'a', 'ex-07');
    expect(lineupStaminaCost(s.players['a']!, 3)).toBe(2);
    expect(lineupStaminaCost(s.players['a']!, 0)).toBe(0);
    // 같은 직원 구성에서 특성이 살아 있으면 1돈 덜, 출장정지면 할인 없음
    const active = tuesday();
    withStaff(active, 'a', 'st-25');
    const suspended = tuesday();
    withStaff(suspended, 'a', 'st-25', 1);
    expect(upkeepDue(active.players['a']!)).toBe(Math.max(0, upkeepDue(suspended.players['a']!) - 1));
  });

  it('전술 카드 새로 뽑기(st-23): 경기 준비 중 1회, 버린 카드는 더미 맨 아래로', () => {
    const s = gameAtMonday();
    startFriday(s);
    const pid = s.firstPlayer;
    const hand = [...s.players[pid]!.tacticCards];
    expect(() => redrawTactic(s, pid, hand[0]!)).toThrow(GameError); // 특성 없음
    withStaff(s, pid, 'st-23');
    const next = applyAction(s, pid, { type: 'redrawTactic', cardId: hand[0]! }, seededRng());
    const p = next.players[pid]!;
    expect(p.tacticCards).toHaveLength(hand.length);
    expect(p.tacticCards).not.toContain(hand[0]);
    expect(next.decks.tactics[next.decks.tactics.length - 1]).toBe(hand[0]);
    expect(p.tacticRedrawn).toBe(true);
    expect(() => redrawTactic(next, pid, p.tacticCards[0]!)).toThrow(GameError); // 1회만
  });
});
