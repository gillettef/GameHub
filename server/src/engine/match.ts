import type { Formation, Role, Sector } from './types';

// 규칙서 p.21~23 경기 진행 (구획 비교) 순수 로직

export interface Slot {
  id: string; // 토큰 id 또는 상대 슬롯 식별자
  role: Role;
  skill: number;
}

export interface Goalkeeper {
  skill: number;
  saves: number;
}

export interface TeamSide {
  sectors: Record<Sector, Slot[]>;
  goalkeeper: Goalkeeper;
}

export interface SectorReport {
  mine: Sector;
  theirs: Sector;
  myGoals: number;
  theirGoals: number;
  myScorers: string[];
}

export interface MatchReport {
  myGoals: number;
  theirGoals: number;
  outcome: 'win' | 'draw' | 'loss';
  sectors: SectorReport[];
  scorers: string[]; // 득점한 내 슬롯 id (유망주 경력 칸용)
}

// 비교 순서 (p.21): 내 LW↔상대 RW, 내 RW↔상대 LW, 내 CF↔상대 CB, 내 CM↔상대 CM, 내 CB↔상대 CF
export const SECTOR_PAIRS: readonly [Sector, Sector][] = [
  ['LW', 'RW'],
  ['RW', 'LW'],
  ['CF', 'CB'],
  ['CM', 'CM'],
  ['CB', 'CF'],
];

// 포메이션 → 구획별 인원 (라인당 센터 최대 3, 초과분은 LW 다음 RW). 각 윙 구획은 라인마다 1지역
export function sectorCounts(f: Formation): Record<Sector, number> {
  const counts: Record<Sector, number> = { LW: 0, CB: 0, CM: 0, CF: 0, RW: 0 };
  const lines: [Sector, number][] = [['CB', f.defenders], ['CM', f.midfielders], ['CF', f.forwards]];
  for (const [center, n] of lines) {
    counts[center] = Math.min(n, 3);
    if (n > 3) counts.LW++;
    if (n > 4) counts.RW++;
  }
  return counts;
}

interface Shots {
  goals: number;
  savesUsed: number;
  unblockedSkill: number;
  scorers: string[];
}

// 뚫린 슛 목록에 골키퍼 적용: 역량 ≤ 골키퍼 역량인 슛만 남은 선방 수만큼 막는다 (p.22)
function applyKeeper(unblocked: Slot[], gk: Goalkeeper, savesLeft: number): Shots {
  const savable = unblocked.filter((s) => s.skill <= gk.skill).sort((a, b) => b.skill - a.skill);
  const saved = new Set(savable.slice(0, Math.min(savesLeft, savable.length)).map((s) => s.id));
  const scorers = unblocked.filter((s) => !saved.has(s.id)).map((s) => s.id);
  return { goals: scorers.length, savesUsed: saved.size, unblockedSkill: unblocked.reduce((n, s) => n + s.skill, 0), scorers };
}

// 득점 최소 → 선방 소모 최소 → 뚫린 슛 역량 합 최소(강한 공격을 수비가 막는다)
function better(a: Shots, b: Shots): boolean {
  if (a.goals !== b.goals) return a.goals < b.goals;
  if (a.savesUsed !== b.savesUsed) return a.savesUsed < b.savesUsed;
  return a.unblockedSkill < b.unblockedSkill;
}

// 공격 vs 수비 짝짓기 전수 탐색: 양 팀 모두 가장 적게 득점하는 방향 (p.21)
function resolveAttack(attackers: Slot[], defenders: Slot[], gk: Goalkeeper, savesLeft: number): Shots {
  let best: Shots | null = null;
  const used = new Array<boolean>(defenders.length).fill(false);

  const search = (i: number, unblocked: Slot[]) => {
    if (i === attackers.length) {
      const shots = applyKeeper(unblocked, gk, savesLeft);
      if (!best || better(shots, best)) best = shots;
      return;
    }
    const att = attackers[i]!;
    // 수비 없이 통과
    search(i + 1, [...unblocked, att]);
    for (let d = 0; d < defenders.length; d++) {
      if (used[d] || defenders[d]!.skill < att.skill) continue; // 막으려면 수비 역량 ≥ 공격 역량
      used[d] = true;
      search(i + 1, unblocked);
      used[d] = false;
    }
  };
  search(0, []);
  return best!;
}

function byRole(slots: Slot[], role: Role): Slot[] {
  return slots.filter((s) => s.role === role);
}

export function resolveMatch(mine: TeamSide, theirs: TeamSide): MatchReport {
  let mySaves = mine.goalkeeper.saves;
  let theirSaves = theirs.goalkeeper.saves;
  const sectors: SectorReport[] = [];
  const scorers: string[] = [];

  for (const [m, t] of SECTOR_PAIRS) {
    const mySlots = mine.sectors[m];
    const theirSlots = theirs.sectors[t];

    const theirShots = resolveAttack(byRole(theirSlots, 'attack'), byRole(mySlots, 'defense'), mine.goalkeeper, mySaves);
    mySaves -= theirShots.savesUsed;
    const myShots = resolveAttack(byRole(mySlots, 'attack'), byRole(theirSlots, 'defense'), theirs.goalkeeper, theirSaves);
    theirSaves -= myShots.savesUsed;

    sectors.push({ mine: m, theirs: t, myGoals: myShots.goals, theirGoals: theirShots.goals, myScorers: myShots.scorers });
    scorers.push(...myShots.scorers);
  }

  const myGoals = sectors.reduce((n, s) => n + s.myGoals, 0);
  const theirGoals = sectors.reduce((n, s) => n + s.theirGoals, 0);
  return {
    myGoals,
    theirGoals,
    outcome: myGoals > theirGoals ? 'win' : myGoals < theirGoals ? 'loss' : 'draw',
    sectors,
    scorers,
  };
}
