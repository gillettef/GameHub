import { describe, expect, it } from 'vitest';
import { resolveMatch, sectorCounts } from './match';
import type { Slot, TeamSide } from './match';

const A = (id: string, skill: number): Slot => ({ id, role: 'attack', skill });
const D = (id: string, skill: number): Slot => ({ id, role: 'defense', skill });

function side(partial: Partial<Record<keyof TeamSide['sectors'], Slot[]>>, gk = { skill: 1, saves: 1 }): TeamSide {
  return { sectors: { LW: [], CB: [], CM: [], CF: [], RW: [], ...partial }, goalkeeper: gk };
}

describe('sectorCounts', () => {
  it('라인 3 이하는 센터, 4는 +LW, 5는 +RW', () => {
    expect(sectorCounts({ defenders: 4, midfielders: 4, forwards: 2 })).toEqual({ CB: 3, CM: 3, CF: 2, LW: 2, RW: 0 });
    expect(sectorCounts({ defenders: 4, midfielders: 5, forwards: 1 })).toEqual({ CB: 3, CM: 3, CF: 1, LW: 2, RW: 1 });
    expect(sectorCounts({ defenders: 3, midfielders: 4, forwards: 3 })).toEqual({ CB: 3, CM: 3, CF: 3, LW: 1, RW: 0 });
  });
});

describe('구획 비교 (p.21 예시)', () => {
  it('예시 1: 포워드(3,2) vs 백(공격2, 수비3): 3은 막히고 2는 득점, 상대 공격 2는 내 수비가 없어 득점', () => {
    const mine = side({ CF: [A('11', 3), A('10', 2)] }, { skill: 0, saves: 0 });
    const theirs = side({ CB: [A('b1', 2), D('b2', 3)] }, { skill: 0, saves: 0 });
    const r = resolveMatch(mine, theirs);
    const cf = r.sectors.find((s) => s.mine === 'CF')!;
    expect(cf.myGoals).toBe(1);
    expect(cf.theirGoals).toBe(1);
    expect(r.scorers).toEqual(['10']);
  });

  it('예시 2: 미드 공격2/수비1 vs 상대 미드 공격1/수비1', () => {
    const mine = side({ CM: [A('6', 2), D('1', 1)] }, { skill: 0, saves: 0 });
    const theirs = side({ CM: [A('m1', 1), D('m2', 1)] }, { skill: 0, saves: 0 });
    const r = resolveMatch(mine, theirs);
    const cm = r.sectors.find((s) => s.mine === 'CM')!;
    expect(cm.myGoals).toBe(1);
    expect(cm.theirGoals).toBe(0);
  });

  it('수비보다 공격이 많으면 남는 공격은 전부 득점 시도', () => {
    const mine = side({ CF: [A('a', 1), A('b', 1), A('c', 1)] }, { skill: 0, saves: 0 });
    const theirs = side({ CB: [D('d', 1)] }, { skill: 0, saves: 0 });
    expect(resolveMatch(mine, theirs).myGoals).toBe(2);
  });

  it('짝짓기는 득점을 최소화한다 (강한 수비가 강한 공격을 막음)', () => {
    const mine = side({ CF: [A('a', 3), A('b', 1)] }, { skill: 0, saves: 0 });
    const theirs = side({ CB: [D('d1', 1), D('d2', 3)] }, { skill: 0, saves: 0 });
    expect(resolveMatch(mine, theirs).myGoals).toBe(0);
  });
});

describe('골키퍼 (p.22)', () => {
  it('역량 이하의 슛을 선방 수만큼 막고, 초과 역량은 못 막는다', () => {
    const mine = side({ CF: [A('a', 1), A('b', 1), A('c', 3)] }, { skill: 0, saves: 0 });
    const theirs = side({}, { skill: 2, saves: 2 });
    const r = resolveMatch(mine, theirs);
    expect(r.myGoals).toBe(1);
    expect(r.scorers).toEqual(['c']);
  });

  it('선방은 경기 전체에 걸쳐 소모된다', () => {
    const mine = side({ LW: [A('a', 1)], CF: [A('b', 1)] }, { skill: 0, saves: 0 });
    const theirs = side({}, { skill: 1, saves: 1 });
    expect(resolveMatch(mine, theirs).myGoals).toBe(1);
  });

  it('골키퍼가 없으면 역량 1, 선방 1로 간주하는 것은 호출자 책임 (기본값 전달 확인)', () => {
    const mine = side({ CF: [A('a', 1)] });
    const theirs = side({});
    expect(resolveMatch(mine, theirs).myGoals).toBe(0);
  });
});

describe('전체 예시: 브릭턴 FC vs 그레이타운 볼스 2:2 (p.23)', () => {
  it('규칙서 예시 결과를 재현한다', () => {
    const brixton: TeamSide = {
      sectors: {
        LW: [D('lw1', 2), D('lw2', 1)],
        RW: [A('rw1', 1), A('rw2', 3)],
        CF: [D('cf1', 2), D('cf2', 2), A('cf3', 1)],
        CM: [A('cm1', 2)],
        CB: [A('cb1', 1)],
      },
      goalkeeper: { skill: 2, saves: 1 },
    };
    // 그레이타운 카드는 상하 반전: 브릭턴 LW 상대는 그레이타운 RW
    const greytown: TeamSide = {
      sectors: {
        RW: [A('g-rw-a', 2), D('g-rw-d', 1)],
        LW: [D('g-lw1', 1), D('g-lw2', 1), D('g-lw3', 2)],
        CB: [A('g-cb-a', 4)],
        CM: [A('g-cm-a', 1)],
        CF: [A('g-cf-a', 3), D('g-cf-d1', 2), D('g-cf-d2', 1)],
      },
      goalkeeper: { skill: 2, saves: 1 },
    };
    const r = resolveMatch(brixton, greytown);
    expect(r.sectors.map((s) => [s.myGoals, s.theirGoals])).toEqual([[0, 0], [1, 0], [0, 1], [1, 0], [0, 1]]);
    expect(r.myGoals).toBe(2);
    expect(r.theirGoals).toBe(2);
    expect(r.outcome).toBe('draw');
  });
});
