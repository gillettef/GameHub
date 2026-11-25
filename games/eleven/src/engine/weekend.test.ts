import { describe, expect, it } from 'vitest';
import { applyAction } from './actions';
import { cards } from './cards';
import { finalScores, leagueRank, scorePlayer, staffSetPoints } from './scoring';
import { GameError } from './state';
import type { GameState } from './state';
import { gameAtMonday, seededRng } from './test-utils';
import { UPKEEP_SOURCE, runWeekend, upkeepDue } from './weekend';

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
    const veteransBefore = [...s.market.veterans];
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
    expect(s.market.veterans.slice(1)).toEqual(veteransBefore.slice(0, 4)); // 베테랑 행도 같은 순환
    expect(s.decks.discards.veterans).toContain(veteransBefore[4]);
    expect(s.decks.discards.prospects).toContain(prospectTop); // 유망주는 다시 섞이지 않는 별도 더미로
    expect(s.firstPlayer).toBe('b');
    expect(s.week).toBe(2);
    expect(s.phase.kind).toBe('monday.board');
  });

  it('월요일 화면용 요약: 지난 주말 유지비·버린 자원 + 이번 주 조달 (weekReport)', () => {
    const s = ready();
    const due = upkeepDue(s.players['a']!);
    runWeekend(s, seededRng());
    const report = s.players['a']!.weekReport!;
    const proc = cards.boardData.procurement;
    const t = s.players['a']!.tracks;
    expect(report.week).toBe(2);
    expect(report.upkeep).toEqual({ due, paid: due, suspensions: 0 });
    expect(report.discarded).toEqual({ fandom: 2, ops: 2, stamina: 3 }); // 3·3·4 개에서 1개씩만 남김
    expect(report.procured).toEqual({ money: proc.money[t.money - 1], fandom: proc.fandom[t.fandom - 1], ops: proc.ops[t.ops - 1], stamina: proc.stamina[t.stamina - 1] });
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

  it('유지비 부족분마다 직원 카드 1장을 골라 출장정지 2개: 출장정지 없는 카드 먼저, 그 뒤로는 참가자가 고른다 (p.25 3)', () => {
    let s = ready();
    const p = s.players['a']!;
    p.staff.push({ cardId: 'st-05', exhausted: false, suspension: 1 });
    p.roster.push(...Array.from({ length: 6 }, (_, i) => ({ ...structuredClone(p.roster[0]!), instanceId: `x${i}` })));
    p.resources.money = 0;
    const due = upkeepDue(p);
    expect(due).toBeGreaterThanOrEqual(2);
    runWeekend(s, seededRng());
    // 출장정지 없는 직원이 하나뿐이라 첫 미납분은 자동으로 그 카드에, 나머지는 고르기를 기다린다
    expect(s.players['a']!.staff.map((x) => x.suspension)).toEqual([2, 1]);
    expect(s.players['a']!.pending).toHaveLength(due - 1);
    expect(s.players['a']!.pending[0]).toMatchObject({ source: UPKEEP_SOURCE, target: 'staff', candidates: ['0', '1'] });
    // 고르기 전에는 다른 행동을 할 수 없다
    s.phase = { kind: 'monday.board', current: 'a', meetings: s.phase.kind === 'monday.board' ? s.phase.meetings : {} };
    expect(() => applyAction(s, 'a', { type: 'rollBoardDie' }, seededRng())).toThrow(GameError);
    while (s.players['a']!.pending.length > 0) {
      s = applyAction(s, 'a', { type: 'resolvePending', pendingId: s.players['a']!.pending[0]!.id, choice: '1' }, seededRng());
    }
    expect(s.players['a']!.staff.map((x) => x.suspension)).toEqual([2, 1 + 2 * (due - 1)]); // 전부 두 번째 직원에 몰아 놓기로 골랐다
    expect(() => applyAction(s, 'a', { type: 'rollBoardDie' }, seededRng())).not.toThrow();
  });

  it('유지비 미납: 출장정지 없는 직원이 여럿이면 그중에서 고르고, 직원이 한 명이면 자동', () => {
    let s = ready();
    const p = s.players['a']!;
    p.staff.push({ cardId: 'st-05', exhausted: false, suspension: 0 }, { cardId: 'st-06', exhausted: false, suspension: 3 });
    p.resources.money = upkeepDue(p) - 1; // 1돈 부족
    runWeekend(s, seededRng());
    expect(s.players['a']!.pending[0]).toMatchObject({ candidates: ['0', '1'] }); // 이미 출장정지가 있는 세 번째 직원은 후보가 아니다
    s = applyAction(s, 'a', { type: 'resolvePending', pendingId: s.players['a']!.pending[0]!.id, choice: '1' }, seededRng());
    expect(s.players['a']!.staff.map((x) => x.suspension)).toEqual([0, 2, 3]);

    const solo = ready();
    solo.players['a']!.resources.money = 0;
    const soloDue = upkeepDue(solo.players['a']!);
    runWeekend(solo, seededRng());
    expect(solo.players['a']!.pending).toHaveLength(0);
    expect(solo.players['a']!.staff[0]!.suspension).toBe(2 * soloDue);
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
    expect(score.infrastructure).toBe(2); // p.26 예시: 관중석 2개 = 2승점
    expect(score.office).toBe(5);
    expect(score.suspensions).toBe(-1);
    expect(score.total).toBe(15 + 10 + score.staffSets + 2 + 5 - 1 + score.objective);
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
