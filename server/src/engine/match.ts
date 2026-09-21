import { CENTER_MAX } from './types';
import type { Column, Formation, Line, Region, Role, Sector } from './types';

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

const CENTER_SECTOR: Record<Line, Sector> = { back: 'CB', mid: 'CM', fwd: 'CF' };

export function regionLine(r: Region): Line {
  return r.split('-')[0] as Line;
}
export function regionColumn(r: Region): Column {
  return r.split('-')[1] as Column;
}
// 지역 → 구획: 윙 열은 라인과 상관없이 그 윙 구획, 센터 열은 라인의 센터 구획
export function regionSector(r: Region): Sector {
  const col = regionColumn(r);
  return col === 'L' ? 'LW' : col === 'R' ? 'RW' : CENTER_SECTOR[regionLine(r)];
}
// 포메이션 → 라인별 인원
export function lineCounts(f: Formation): Record<Line, number> {
  return { back: f.defenders, mid: f.midfielders, fwd: f.forwards };
}
// 지역 정원 (p.20): 센터 지역 1~3, 윙 지역 0~1
export function regionLimit(r: Region): { min: number; max: number } {
  return regionColumn(r) === 'C' ? { min: 1, max: CENTER_MAX } : { min: 0, max: 1 };
}
// 배치 검증 (엔진·UI 공용): 라인별 인원이 포메이션과 같고 지역 정원을 지키는지. 문제를 사람이 읽을 문장으로 돌려준다
export function regionIssues(formation: Formation, regions: Region[], label: (r: Region) => string, lineLabel: (l: Line) => string): string[] {
  const issues: string[] = [];
  const need = lineCounts(formation);
  const count = (pred: (r: Region) => boolean) => regions.filter(pred).length;
  for (const line of ['back', 'mid', 'fwd'] as const) {
    const n = count((r) => regionLine(r) === line);
    if (n !== need[line]) issues.push(`${lineLabel(line)} ${n}/${need[line]}`);
    for (const col of ['L', 'C', 'R'] as const) {
      const region: Region = `${line}-${col}`;
      const { min, max } = regionLimit(region);
      const here = count((r) => r === region);
      if (here > max) issues.push(`${label(region)} 최대 ${max}명 (지금 ${here})`);
      else if (here < min && need[line] > 0) issues.push(`${label(region)} 최소 ${min}명`);
    }
  }
  return issues;
}

// 포메이션 → 구획별 인원의 **기본 배분**(라인당 센터 최대 3, 초과분은 LW 다음 RW). 참가자는 이와 다르게 나눌 수 있다 — 상대 팀 카드 생성·자동 배치의 기준으로만 쓴다
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
