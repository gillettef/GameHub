import { describe, expect, it } from 'vitest';
import { OBJECTIVE_CARDS, PLAYER_CARDS, STAFF_CARDS } from '../data';
import { addToRoster } from './effects';
import { checkObjective, objectiveLevel } from './objectives';
import { scorePlayer } from './scoring';
import type { GameState, PlayerState } from './state';
import { gameAtMonday } from './test-utils';

// p.27 목표 카드: 달성 2승점, 완벽 달성 추가 2승점
function setup(objective: string): { s: GameState; p: PlayerState } {
  const s = gameAtMonday();
  const p = s.players['a']!;
  p.objective = objective;
  return { s, p };
}
const level = (s: GameState, p: PlayerState) => objectiveLevel(p, s.league, p.objective);
const match = (week: number, myGoals: number, theirGoals: number) => ({ week, myGoals, theirGoals, outcome: myGoals > theirGoals ? ('win' as const) : myGoals < theirGoals ? ('loss' as const) : ('draw' as const) });

describe('목표 카드 판정 (p.27)', () => {
  it('모든 목표 카드에 판정 조건이 있다', () => {
    for (const c of OBJECTIVE_CARDS) {
      expect(c.goalCheck, c.id).toBeDefined();
      expect(c.perfectCheck, c.id).toBeDefined();
    }
  });

  it('ob-01 더비: 5주차 승리 / 2골 차 이상', () => {
    const { s, p } = setup('ob-01');
    expect(level(s, p)).toBe(0);
    p.matchHistory = [match(4, 3, 0), match(5, 1, 1)];
    expect(level(s, p)).toBe(0);
    p.matchHistory = [match(5, 2, 1)];
    expect(level(s, p)).toBe(1);
    p.matchHistory = [match(5, 3, 1)];
    expect(level(s, p)).toBe(2);
  });

  it('ob-02 개막전: 1주차 승리 / 무실점', () => {
    const { s, p } = setup('ob-02');
    p.matchHistory = [match(1, 2, 1)];
    expect(level(s, p)).toBe(1);
    p.matchHistory = [match(1, 1, 0)];
    expect(level(s, p)).toBe(2);
  });

  it('ob-03 연승 행진: 3주 / 4주 연속 승리 (중간에 끊기면 다시 센다)', () => {
    const { s, p } = setup('ob-03');
    p.matchHistory = [match(1, 1, 0), match(2, 1, 0), match(3, 0, 0), match(4, 1, 0), match(5, 1, 0)];
    expect(level(s, p)).toBe(0);
    p.matchHistory.push(match(6, 2, 0));
    expect(level(s, p)).toBe(1);
    p.matchHistory[2] = match(3, 1, 0);
    expect(level(s, p)).toBe(2);
  });

  it('ob-04 정상 등극: 리그 1위(공동 1위 포함) / 다른 모든 팀과 3칸 이상', () => {
    const { s, p } = setup('ob-04');
    const top = Math.max(...Object.values(s.league.players), ...s.league.opponents.map((o) => o.position));
    s.league.players['a'] = top - 1;
    s.league.players['b'] = top;
    expect(level(s, p)).toBe(0);
    s.league.players['a'] = top;
    expect(level(s, p)).toBe(1);
    s.league.players['a'] = top + 3;
    expect(level(s, p)).toBe(2);
  });

  it('ob-05 직원 세트 3장/4장, ob-06 기반 시설 4개/6개, ob-09 돈 10/15, ob-11 사무실 3칸/4칸', () => {
    const { s, p } = setup('ob-05');
    const set = STAFF_CARDS[0]!.set;
    const same = STAFF_CARDS.filter((c) => c.set === set).map((c) => ({ cardId: c.id, exhausted: false, suspension: 0 }));
    p.staff = same.slice(0, 3);
    expect(level(s, p)).toBe(1);
    p.staff = same.slice(0, 4);
    expect(level(s, p)).toBe(2);

    p.objective = 'ob-06';
    p.infrastructure = ['stand3', 'shop', 'lights'] as PlayerState['infrastructure'];
    expect(level(s, p)).toBe(0);
    p.infrastructure = [...p.infrastructure, 'stand4'] as PlayerState['infrastructure'];
    expect(level(s, p)).toBe(1);

    p.objective = 'ob-09';
    p.resources.money = 9;
    expect(level(s, p)).toBe(0);
    p.resources.money = 12;
    expect(level(s, p)).toBe(1);
    p.resources.money = 15;
    expect(level(s, p)).toBe(2);

    p.objective = 'ob-11';
    p.office = 2;
    expect(level(s, p)).toBe(0);
    p.office = 3;
    expect(level(s, p)).toBe(1);
    p.office = 4;
    expect(level(s, p)).toBe(2);
  });

  it('ob-07 유스 아카데미·ob-08 정예 스쿼드: 훈련된 유망주/선수 수, 유망주 득점 경력 승점', () => {
    const { s, p } = setup('ob-07');
    const prospects = PLAYER_CARDS.filter((c) => c.kind === 'prospect').slice(0, 2).map((c) => addToRoster(p, c.id));
    expect(level(s, p)).toBe(0);
    for (const r of prospects) r.trained = true;
    expect(level(s, p)).toBe(1);
    prospects[0]!.careerUsed.goals = 1;
    expect(level(s, p)).toBe(2);

    p.objective = 'ob-08';
    for (const r of p.roster) r.trained = false;
    for (const r of p.roster.slice(0, 4)) r.trained = true;
    expect(level(s, p)).toBe(1);
  });

  it('ob-10 무사고 시즌: 종료 시 부상 토큰 없음 / 경기 영향 주사위로 부상을 받은 적 없음', () => {
    const { s, p } = setup('ob-10');
    expect(level(s, p)).toBe(2);
    p.matchDieInjured = true;
    expect(level(s, p)).toBe(1);
    p.roster[0]!.tokens.injury = 1;
    expect(level(s, p)).toBe(0);
  });

  it('ob-12 후원사 총출동: 계약 3건(장내 방송은 횟수) / 세 유형 모두', () => {
    const { s, p } = setup('ob-12');
    p.kitSponsors = 3;
    expect(level(s, p)).toBe(1);
    p.kitSponsors = 1;
    p.sponsors = { billboards: ['sp-01'], naming: 'sp-02' };
    expect(level(s, p)).toBe(2);
    expect(checkObjective(p, s.league, { kind: 'sponsors', count: 4 })).toBe(false);
  });

  it('최종 점수에 목표 승점이 더해진다 (달성 2 / 완벽 4)', () => {
    const { s, p } = setup('ob-09');
    const base = scorePlayer(s, 'a');
    expect(base.objective).toBe(0);
    p.resources.money = 10;
    expect(scorePlayer(s, 'a')).toMatchObject({ objective: 2, objectiveLevel: 1, objectiveCard: 'ob-09', total: base.total + 2 });
    p.resources.money = 15;
    expect(scorePlayer(s, 'a')).toMatchObject({ objective: 4, objectiveLevel: 2, total: base.total + 4 });
  });
});
