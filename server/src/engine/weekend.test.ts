import { describe, expect, it } from 'vitest';
import { cards } from './cards';
import { finalScores, leagueRank, scorePlayer, staffSetPoints } from './scoring';
import type { GameState } from './state';
import { gameAtMonday, seededRng } from './test-utils';
import { runWeekend, upkeepDue } from './weekend';

function ready(): GameState {
  const s = gameAtMonday();
  for (const id of s.seats) s.players[id]!.resources = { money: 10, fandom: 3, ops: 3, stamina: 4 };
  return s;
}

describe('주말 (p.25)', () => {
  it('카드 회복, 자원 상한, 시장 순환, 유망주 버림, 선 참가자 교대, 다음 주 월요일', () => {
    const s = ready();
    s.players['a']!.staff[0]!.exhausted = true;
    s.players['a']!.roster[0]!.exhausted = true;
    const marketBefore = [...s.market.players];
    const prospectTop = s.decks.prospects[0];
    runWeekend(s, seededRng());
    expect(s.players['a']!.staff[0]!.exhausted).toBe(false);
    expect(s.players['a']!.roster[0]!.exhausted).toBe(false);
    // 주말에 1개씩만 남긴 뒤 다음 주 월요일 조달이 더해진 값
    const proc = cards.boardData.procurement;
    for (const id of s.seats) {
      const { resources: r, tracks: t } = s.players[id]!;
      expect(r.fandom).toBe(1 + proc.fandom[t.fandom - 1]!);
      expect(r.ops).toBe(1 + proc.ops[t.ops - 1]!);
      expect(r.stamina).toBe(1 + proc.stamina[t.stamina - 1]!);
    }
    expect(s.market.players.slice(1)).toEqual(marketBefore.slice(0, 4));
    expect(s.decks.discards.players).toContain(prospectTop);
    expect(s.firstPlayer).toBe('b');
    expect(s.week).toBe(2);
    expect(s.phase.kind).toBe('monday.board');
  });

  it('유지비: 선수/직원/기반 시설 수로 계산, 돈은 상한 없이 유지', () => {
    const s = ready();
    const p = s.players['a']!;
    const due = upkeepDue(p);
    expect(due).toBe(
      cards.boardData.upkeep.players[p.roster.length]! + cards.boardData.upkeep.staff[p.staff.length]! + cards.boardData.upkeep.stadium[4 + p.infrastructure.length]!,
    );
    runWeekend(s, seededRng());
    const a = s.players['a']!;
    expect(a.resources.money).toBe(10 - due + cards.boardData.procurement.money[a.tracks.money - 1]!);
  });

  it('유지비 부족분마다 직원 카드에 출장정지 2개 (없는 카드부터)', () => {
    const s = ready();
    const p = s.players['a']!;
    p.staff.push({ cardId: 'st-05', exhausted: false, suspension: 1 });
    p.roster.push(...Array.from({ length: 6 }, (_, i) => ({ ...structuredClone(p.roster[0]!), instanceId: `x${i}` })));
    p.resources.money = 0;
    const due = upkeepDue(p);
    expect(due).toBeGreaterThanOrEqual(2);
    runWeekend(s, seededRng());
    const staff = s.players['a']!.staff;
    expect(staff[0]!.suspension).toBeGreaterThanOrEqual(2); // 출장정지 없던 카드가 먼저 받는다
    expect(staff.reduce((n, x) => n + x.suspension, 0)).toBe(1 + 2 * due);
    expect(Math.abs(staff[0]!.suspension - staff[1]!.suspension)).toBeLessThanOrEqual(2); // 이후엔 적은 쪽부터
  });

  it('6주차 주말에는 유지비 없이 게임 종료', () => {
    const s = ready();
    s.week = 6;
    runWeekend(s, seededRng());
    expect(s.phase.kind).toBe('gameOver');
    expect(s.players['a']!.resources.money).toBe(10);
  });
});

describe('게임 종료 승점 (p.26)', () => {
  it('리그 등수: 같은 위치는 같은 등수', () => {
    const s = ready();
    s.league.players = { a: 5, b: 5, c: 3, d: 0 };
    s.league.opponents.forEach((o, i) => (o.position = i === 0 ? 9 : 0));
    expect(leagueRank(s, 'a')).toBe(2);
    expect(leagueRank(s, 'b')).toBe(2);
    expect(leagueRank(s, 'c')).toBe(4);
    expect(leagueRank(s, 'd')).toBe(5);
  });

  it('직원 세트 승점: 보유 수별 표, 출장정지 카드 제외', () => {
    const s = ready();
    const p = s.players['a']!;
    p.staff = [
      { cardId: 'st-01', exhausted: false, suspension: 0 },
      { cardId: 'st-02', exhausted: false, suspension: 0 },
      { cardId: 'st-03', exhausted: false, suspension: 1 },
    ];
    expect(staffSetPoints(p)).toBe(cards.staff('st-01').setPoints[1]);
  });

  it('점수 계산 예시 (p.26 구조): 리그 + 토큰 + 세트 + 시설 + 사무실 − 출장정지', () => {
    const s = ready();
    const p = s.players['a']!;
    s.league.players = { a: 9, b: 0, c: 0, d: 0 };
    s.league.opponents.forEach((o) => (o.position = 0));
    p.vp = 9;
    p.roster[0]!.careerVP = 1;
    p.infrastructure = ['stand3', 'stand4'];
    p.office = 2;
    p.roster[1]!.tokens.suspension = 1;
    const score = scorePlayer(s, 'a');
    expect(score.leagueRank).toBe(1);
    expect(score.league).toBe(15);
    expect(score.tokens).toBe(10);
    expect(score.infrastructure).toBe(3);
    expect(score.office).toBe(5);
    expect(score.suspensions).toBe(-1);
    expect(score.total).toBe(15 + 10 + score.staffSets + 3 + 5 - 1);
  });

  it('동점이면 리그 순위, 그래도 같으면 공동 승리', () => {
    const s = ready();
    for (const id of s.seats) {
      s.players[id]!.staff = [];
      s.players[id]!.roster = [];
      s.players[id]!.vp = 0;
    }
    s.league.players = { a: 3, b: 3, c: 0, d: 0 };
    s.league.opponents.forEach((o) => (o.position = 0));
    expect(finalScores(s).winners).toEqual(['a', 'b']);
    s.players['c']!.vp = 20;
    expect(finalScores(s).winners).toEqual(['c']);
  });
});
