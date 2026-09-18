import { describe, expect, it } from 'vitest';
import { cards, effectiveSkill } from './cards';
import { GameError } from './state';
import type { GameState } from './state';
import { gameAtMonday, seededRng } from './test-utils';
import {
  buildInfrastructure,
  buildOffice,
  cardAction,
  endTurn,
  hireStaff,
  pass,
  recruitPlayer,
  recruitProspect,
  releasePlayer,
  signSponsor,
  startWeekday,
} from './weekday';

// 같은 참가자가 같은 날 여러 기본 행동을 시험하기 위한 테스트 전용 리셋
function resetBasic(s: GameState): void {
  if (s.phase.kind === 'weekday') s.phase.basicDone = false;
}

function tuesday(money = 20): GameState {
  const s = gameAtMonday();
  startWeekday(s);
  for (const id of s.seats) {
    s.players[id]!.resources = { money, fandom: 2, ops: 4, stamina: 2 };
    s.players[id]!.pending = [];
  }
  return s;
}

describe('차례 진행 (p.12, p.14)', () => {
  it('선 참가자부터 시계방향, 3일 후 경기일', () => {
    let s = tuesday();
    expect(() => pass(s, 'b')).toThrow(GameError);
    expect(() => endTurn(s, 'a')).toThrow(GameError);
    const order: string[] = [];
    for (let i = 0; i < 12; i++) {
      if (s.phase.kind !== 'weekday') throw new Error();
      order.push(`${s.phase.day}:${s.phase.current}`);
      s = endTurn(pass(s, s.phase.current), s.phase.current);
    }
    expect(order.slice(0, 4)).toEqual(['tue:a', 'tue:b', 'tue:c', 'tue:d']);
    expect(order[4]).toBe('wed:a');
    expect(order[11]).toBe('thu:d');
    expect(s.phase.kind).toBe('friday.prepare');
  });

  it('하루에 기본 행동은 한 번', () => {
    const s = pass(tuesday(), 'a');
    expect(() => pass(s, 'a')).toThrow(GameError);
    expect(() => buildOffice(s, 'a')).toThrow(GameError);
  });
});

describe('선수 영입/방출 (p.15~16)', () => {
  it('맨 오른쪽 3장 중 영입, 비용 지불, 시장 보충, 유니폼 배정', () => {
    const s0 = tuesday();
    const cardId = s0.market.players[4]!;
    const cost = cards.player(cardId).untrained.cost;
    const s = recruitPlayer(s0, 'a', 4, seededRng());
    const p = s.players['a']!;
    expect(p.resources.money).toBe(20 - cost);
    expect(p.roster.at(-1)!.cardId).toBe(cardId);
    expect(s.market.players).toHaveLength(5);
    expect(s.market.players).not.toContain(cardId);
    expect(() => recruitPlayer(s0, 'a', 1, seededRng())).toThrow(GameError);
    expect(() => recruitPlayer(tuesday(0), 'a', 4, seededRng())).toThrow(GameError);
  });

  it('유망주는 더미 맨 위에서', () => {
    const s0 = tuesday();
    const top = s0.decks.prospects[0]!;
    const s = recruitProspect(s0, 'a');
    expect(s.players['a']!.roster.at(-1)!.cardId).toBe(top);
    expect(s.decks.prospects[0]).not.toBe(top);
  });

  it('방출: 2돈 + 역량, 부상 시 절반, 경력 승점 획득', () => {
    const s0 = tuesday(0);
    const p0 = s0.players['a']!;
    const inst = p0.roster[0]!;
    inst.careerVP = 1;
    const expected = 2 + effectiveSkill(inst);
    const s = releasePlayer(s0, 'a', inst.instanceId);
    const p = s.players['a']!;
    expect(p.resources.money).toBe(expected);
    expect(p.vp).toBe(1);
    expect(p.roster.some((r) => r.instanceId === inst.instanceId)).toBe(false);
    expect(p.uniforms.some((u) => u.cardInstanceId === inst.instanceId)).toBe(false);
    expect(s.decks.discards.players).toContain(inst.cardId);

    inst.tokens.injury = 1;
    const injured = releasePlayer(s0, 'a', inst.instanceId);
    expect(injured.players['a']!.resources.money).toBe(Math.floor(expected / 2));
  });
});

describe('직원 고용 (p.17)', () => {
  it('비용 지불, 즉시 보너스 적용, 시장 보충', () => {
    const s0 = tuesday();
    const cardId = s0.market.staff[2]!;
    const card = cards.staff(cardId);
    const s = hireStaff(s0, 'a', 2, seededRng());
    const p = s.players['a']!;
    expect(p.staff.map((x) => x.cardId)).toContain(cardId);
    expect(p.resources.money).toBeLessThanOrEqual(20 - card.cost);
    expect(s.market.staff).not.toContain(cardId);
  });
});

describe('스폰서 계약 (p.18)', () => {
  it('키트는 즉시 버림, 광고판은 최대 2(+1), 명명권은 1', () => {
    let s = tuesday();
    const kit = s.market.sponsors[4]!;
    s = signSponsor(s, 'a', 4, 'kit', seededRng());
    expect(s.decks.discards.sponsors).toContain(kit);

    s = tuesday();
    s = signSponsor(s, 'a', 4, 'billboard', seededRng());
    resetBasic(s);
    s = signSponsor(s, 'a', 4, 'billboard', seededRng(), 'bonus');
    resetBasic(s);
    expect(s.players['a']!.sponsors.billboards).toHaveLength(2);
    expect(() => signSponsor(s, 'a', 4, 'billboard', seededRng())).toThrow(GameError);

    s.players['a']!.infrastructure.push('billboard3');
    s = signSponsor(s, 'a', 4, 'billboard', seededRng());
    expect(s.players['a']!.sponsors.billboards).toHaveLength(3);

    resetBasic(s);
    s = signSponsor(s, 'a', 3, 'naming', seededRng());
    expect(s.players['a']!.sponsors.naming).toBeDefined();
    resetBasic(s);
    expect(() => signSponsor(s, 'a', 3, 'naming', seededRng())).toThrow(GameError);
  });
});

describe('스타디움/사무실 건설 (p.19)', () => {
  it('기반 시설 3돈, 고유 시설 중복 불가, 관중석은 번호 순서, 최대 7개', () => {
    let s = tuesday();
    expect(() => buildInfrastructure(s, 'a', 'stand4')).toThrow(GameError); // 3번 관중석부터
    s = buildInfrastructure(s, 'a', 'stand3');
    expect(s.players['a']!.resources.money).toBe(17);
    expect(s.players['a']!.infrastructure).toEqual(['stand3']);
    resetBasic(s);
    expect(() => buildInfrastructure(s, 'a', 'stand3')).toThrow(GameError);
    s = buildInfrastructure(s, 'a', 'shop');
    expect(s.players['a']!.resources.money).toBe(15); // 3돈 지불 후 상점 보너스 +1
    s.players['a']!.infrastructure = ['shop', 'shop', 'shop', 'shop', 'shop', 'shop', 'shop'];
    resetBasic(s);
    expect(() => buildInfrastructure(s, 'a', 'lights')).toThrow(GameError);
  });

  it('사무실: 칸별 비용, 끝까지 가면 불가', () => {
    let s = tuesday(30);
    const costs = cards.boardData.office.map((o) => o.cost);
    let money = 30;
    for (let step = 0; step < 4; step++) {
      s = buildOffice(s, 'a');
      money -= costs[step]!;
      expect(s.players['a']!.resources.money).toBe(money);
      expect(s.players['a']!.office).toBe(step + 1);
      resetBasic(s);
    }
    expect(() => buildOffice(s, 'a')).toThrow(GameError);
  });
});

describe('카드 행동과 추가 유급 행동 (p.14, p.19)', () => {
  it('첫 번째 트레이너 행동: 카드 소진, 주 1회, 유급이면 운영 2개 추가', () => {
    let s = tuesday();
    s = cardAction(s, 'a', { kind: 'staff', index: 0 });
    const p = s.players['a']!;
    expect(p.staff[0]!.exhausted).toBe(true);
    expect(p.pending.length + p.roster.filter((r) => r.trained).length).toBeGreaterThan(0);
    expect(() => cardAction(s, 'a', { kind: 'staff', index: 0 }, true)).toThrow(GameError);

    s = tuesday();
    s = cardAction(s, 'a', { kind: 'staff', index: 0 }, true);
    expect(s.players['a']!.resources.ops).toBe(2);
    if (s.phase.kind !== 'weekday') throw new Error();
    expect(s.phase.paidDone).toBe(true);
    expect(s.phase.basicDone).toBe(false);
    s = pass(s, 'a');
    expect(() => cardAction(s, 'a', { kind: 'staff', index: 0 }, true)).toThrow(GameError);
  });

  it('출장 정지 카드와 운영 부족은 거부', () => {
    const s = tuesday();
    s.players['a']!.staff[0]!.suspension = 1;
    expect(() => cardAction(s, 'a', { kind: 'staff', index: 0 })).toThrow(GameError);
    s.players['a']!.staff[0]!.suspension = 0;
    s.players['a']!.resources.ops = 1;
    expect(() => cardAction(s, 'a', { kind: 'staff', index: 0 }, true)).toThrow(GameError);
  });
});
