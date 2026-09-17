// placeholder: 상대 팀 카드 64장(16팀 × 4부). 구조는 규칙서 p.21/p.28, 수치는 전부 임의 (CLAUDE.md Mock 데이터 정책)
import type { DivisionTier, Formation, OpponentSlot, OpponentTeamCard, Role, Sector } from '../engine/types';
import { SECTOR_CAPACITY } from '../engine/types';

const TIERS: readonly DivisionTier[] = ['3', '3/2', '2/1', '1'];
const TIER_SUFFIX: Record<DivisionTier, string> = { '3': '3', '3/2': '32', '2/1': '21', '1': '1' };
const GK_SKILL: Record<DivisionTier, number> = { '3': 1, '3/2': 2, '2/1': 2, '1': 3 };
const GK_SAVES: Record<DivisionTier, number> = { '3': 1, '3/2': 1, '2/1': 2, '1': 2 };

interface TeamDef {
  teamId: string;
  teamName: string;
  flavor: string;
  formation: Formation;
  midStart: Role; // 미드필더 역할 교대 시작값
  // 부별 역량 10개. 순서 = 백 → 미드 → 포워드
  skills: Record<DivisionTier, number[]>;
}

const f = (defenders: number, midfielders: number, forwards: number): Formation => ({ defenders, midfielders, forwards });

const TEAMS: TeamDef[] = [
  { teamId: 't01', teamName: '다운타운 유나이티드', flavor: '도심 한복판의 전통 명문으로, 균형 잡힌 조직력이 강점입니다.', formation: f(4, 4, 2), midStart: 'attack',
    skills: { '3': [1, 1, 1, 0, 1, 2, 1, 0, 2, 1], '3/2': [1, 2, 1, 1, 2, 1, 2, 1, 2, 1], '2/1': [2, 3, 2, 1, 2, 2, 3, 1, 3, 2], '1': [3, 4, 3, 2, 3, 3, 4, 2, 4, 3] } },
  { teamId: 't02', teamName: '스틸체스터 FC', flavor: '철강 도시의 거친 팀입니다. 측면 돌파와 빠른 역습을 즐깁니다.', formation: f(4, 3, 3), midStart: 'defense',
    skills: { '3': [1, 1, 0, 1, 1, 1, 2, 2, 1, 0], '3/2': [1, 1, 2, 1, 2, 1, 1, 2, 2, 1], '2/1': [2, 2, 1, 2, 3, 2, 1, 3, 2, 2], '1': [3, 3, 2, 3, 4, 3, 2, 4, 3, 3] } },
  { teamId: 't03', teamName: '노스데일 타운', flavor: '북부 계곡의 공격 축구를 대표합니다. 수비는 종종 비어 있습니다.', formation: f(4, 2, 4), midStart: 'attack',
    skills: { '3': [0, 1, 1, 0, 1, 1, 2, 2, 1, 1], '3/2': [1, 1, 1, 1, 2, 2, 2, 1, 2, 1], '2/1': [1, 2, 2, 1, 3, 2, 3, 2, 3, 1], '1': [2, 3, 3, 2, 3, 3, 4, 4, 3, 3] } },
  { teamId: 't04', teamName: '포트 이스트', flavor: '항구 도시의 팀입니다. 중원 장악을 통해 경기를 지배하려 합니다.', formation: f(3, 5, 2), midStart: 'attack',
    skills: { '3': [1, 1, 1, 1, 2, 1, 1, 0, 1, 1], '3/2': [1, 2, 1, 2, 2, 1, 2, 1, 1, 2], '2/1': [2, 2, 2, 3, 2, 3, 2, 1, 2, 1], '1': [3, 3, 2, 4, 3, 4, 3, 2, 3, 3] } },
  { teamId: 't05', teamName: '브릭턴 FC', flavor: '벽돌처럼 단단한 수비가 명성의 근원입니다. 실점이 드뭅니다.', formation: f(5, 3, 2), midStart: 'defense',
    skills: { '3': [1, 2, 1, 1, 1, 1, 0, 1, 1, 1], '3/2': [2, 2, 1, 1, 1, 1, 2, 1, 1, 2], '2/1': [3, 3, 2, 2, 2, 1, 2, 1, 2, 2], '1': [4, 4, 3, 3, 3, 2, 3, 2, 3, 3] } },
  { teamId: 't06', teamName: '그레이타운 볼스', flavor: '회색 공업 지대의 노장들입니다. 두터운 중원으로 상대를 질식시킵니다.', formation: f(4, 5, 1), midStart: 'defense',
    skills: { '3': [1, 1, 1, 0, 1, 1, 2, 1, 1, 1], '3/2': [1, 2, 1, 1, 2, 1, 2, 1, 1, 2], '2/1': [2, 2, 1, 2, 2, 3, 2, 2, 1, 3], '1': [3, 3, 2, 3, 3, 4, 3, 3, 2, 4] } },
  { teamId: 't07', teamName: '리버사이드 로버스', flavor: '강변 클럽 특유의 유연한 축구를 구사합니다. 세 명의 포워드가 위협적입니다.', formation: f(3, 4, 3), midStart: 'attack',
    skills: { '3': [1, 1, 0, 1, 1, 1, 1, 2, 1, 1], '3/2': [1, 1, 2, 1, 2, 1, 2, 2, 1, 2], '2/1': [2, 1, 2, 2, 2, 2, 1, 3, 3, 2], '1': [3, 2, 3, 3, 3, 3, 2, 4, 4, 3] } },
  { teamId: 't08', teamName: '하버뷰 애슬레틱', flavor: '바닷바람을 등지고 뛰는 팀입니다. 다섯 명의 백이 촘촘한 벽을 세웁니다.', formation: f(5, 4, 1), midStart: 'defense',
    skills: { '3': [1, 1, 1, 1, 0, 1, 1, 1, 1, 2], '3/2': [2, 1, 1, 2, 1, 1, 2, 1, 1, 2], '2/1': [3, 2, 2, 2, 1, 2, 2, 1, 2, 3], '1': [4, 3, 3, 3, 2, 3, 3, 2, 3, 4] } },
  { teamId: 't09', teamName: '올드밀 시티', flavor: '오래된 방앗간 옆 구장을 홈으로 씁니다. 교과서적인 4-4-2를 고수합니다.', formation: f(4, 4, 2), midStart: 'defense',
    skills: { '3': [1, 0, 1, 1, 1, 1, 1, 2, 1, 1], '3/2': [1, 1, 1, 2, 1, 2, 1, 2, 2, 1], '2/1': [2, 1, 2, 2, 2, 3, 2, 2, 3, 1], '1': [3, 2, 3, 3, 3, 4, 3, 3, 4, 2] } },
  { teamId: 't10', teamName: '웨스트게이트 원더러스', flavor: '서쪽 관문의 떠돌이들입니다. 예측하기 어려운 세 명의 공격수를 보유했습니다.', formation: f(4, 3, 3), midStart: 'attack',
    skills: { '3': [1, 1, 0, 1, 1, 0, 1, 2, 1, 2], '3/2': [1, 1, 1, 2, 1, 2, 1, 2, 1, 2], '2/1': [2, 2, 1, 2, 2, 1, 2, 3, 2, 3], '1': [3, 3, 2, 3, 3, 2, 3, 4, 3, 4] } },
  { teamId: 't11', teamName: '캐슬힐 FC', flavor: '언덕 위 성곽 마을의 팀입니다. 공격 일변도라 경기가 늘 요란합니다.', formation: f(4, 2, 4), midStart: 'defense',
    skills: { '3': [1, 1, 1, 0, 0, 1, 2, 1, 1, 2], '3/2': [1, 1, 2, 1, 1, 1, 2, 2, 1, 2], '2/1': [2, 1, 2, 1, 2, 2, 3, 2, 3, 2], '1': [3, 2, 3, 2, 3, 3, 4, 3, 4, 3] } },
  { teamId: 't12', teamName: '실버레이크 유나이티드', flavor: '호숫가의 신흥 부호 구단입니다. 중원에 다섯 명을 세우고 점유율로 압박합니다.', formation: f(3, 5, 2), midStart: 'defense',
    skills: { '3': [1, 0, 1, 1, 1, 2, 1, 1, 1, 1], '3/2': [1, 1, 2, 2, 1, 2, 1, 1, 2, 1], '2/1': [2, 1, 2, 3, 2, 2, 2, 2, 3, 1], '1': [3, 2, 3, 4, 3, 3, 3, 3, 4, 2] } },
  { teamId: 't13', teamName: '이스트필드 타운', flavor: '동쪽 벌판의 실리 축구 팀입니다. 잠그고 버티다 한 방을 노립니다.', formation: f(5, 3, 2), midStart: 'attack',
    skills: { '3': [1, 1, 1, 1, 1, 0, 1, 1, 2, 1], '3/2': [1, 2, 2, 1, 1, 1, 1, 2, 2, 1], '2/1': [2, 3, 2, 2, 1, 2, 2, 1, 3, 2], '1': [3, 4, 3, 3, 2, 3, 3, 2, 4, 3] } },
  { teamId: 't14', teamName: '마운트로열 SC', flavor: '산악 지대의 체력 좋은 팀입니다. 미드필더 다섯 명이 90분 내내 달립니다.', formation: f(4, 5, 1), midStart: 'attack',
    skills: { '3': [1, 1, 0, 1, 2, 1, 1, 1, 1, 1], '3/2': [1, 1, 1, 2, 2, 1, 2, 1, 2, 1], '2/1': [2, 2, 1, 2, 3, 2, 2, 2, 1, 3], '1': [3, 3, 2, 3, 4, 3, 3, 3, 2, 4] } },
  { teamId: 't15', teamName: '콜리어리 웨이브', flavor: '탄광촌에서 자란 팀입니다. 파도처럼 몰아치는 공격이 특징입니다.', formation: f(3, 4, 3), midStart: 'defense',
    skills: { '3': [1, 1, 1, 0, 1, 2, 1, 1, 2, 1], '3/2': [1, 2, 1, 1, 2, 1, 1, 2, 2, 2], '2/1': [2, 2, 2, 1, 2, 2, 2, 3, 3, 2], '1': [3, 3, 3, 2, 3, 3, 3, 4, 4, 3] } },
  { teamId: 't16', teamName: '선더벨 FC', flavor: '천둥 종소리로 유명한 홈구장을 가진 팀입니다. 다섯 명의 백 뒤에는 든든한 골키퍼가 있습니다.', formation: f(5, 4, 1), midStart: 'attack',
    skills: { '3': [1, 1, 1, 1, 1, 1, 0, 1, 1, 2], '3/2': [1, 2, 1, 2, 1, 1, 1, 2, 1, 2], '2/1': [2, 3, 2, 2, 2, 1, 2, 2, 1, 3], '1': [3, 4, 3, 3, 2, 3, 2, 3, 3, 4] } },
];

// 라인별 역할: 백은 수비(5번째 백만 공격, 윙백), 포워드는 공격(4번째 포워드만 수비), 미드는 교대
function lineRoles(form: Formation, midStart: Role): Role[] {
  const roles: Role[] = [];
  for (let i = 0; i < form.defenders; i++) roles.push(i === 4 ? 'attack' : 'defense');
  for (let i = 0; i < form.midfielders; i++) roles.push((i % 2 === 0) === (midStart === 'attack') ? 'attack' : 'defense');
  for (let i = 0; i < form.forwards; i++) roles.push(i === 3 ? 'defense' : 'attack');
  return roles;
}

// 라인 → 구획 배치. 홈 구획이 차면 윙, 그 다음 인접 센터 구획으로 넘친다 (p.20: 정확한 구획은 보고서에 없음)
const HOME: Array<[Sector, Sector[]]> = [
  ['CB', ['LW', 'RW', 'CM', 'CF']],
  ['CM', ['LW', 'RW', 'CF', 'CB']],
  ['CF', ['RW', 'LW', 'CM', 'CB']],
];

function layout(form: Formation, skills: number[], roles: Role[]): Record<Sector, OpponentSlot[]> {
  const sectors: Record<Sector, OpponentSlot[]> = { LW: [], CB: [], CM: [], CF: [], RW: [] };
  const counts = [form.defenders, form.midfielders, form.forwards];
  let idx = 0;
  counts.forEach((n, line) => {
    const [home, fallbacks] = HOME[line]!;
    for (let i = 0; i < n; i++, idx++) {
      const slot: OpponentSlot = { role: roles[idx]!, skill: skills[idx]! };
      const target = [home, ...fallbacks].find((s) => sectors[s].length < SECTOR_CAPACITY[s]);
      if (!target) throw new Error(`opponents.mock: 구획 초과 ${JSON.stringify(form)}`);
      sectors[target].push(slot);
    }
  });
  return sectors;
}

function buildTeam(t: TeamDef): OpponentTeamCard[] {
  const { defenders, midfielders, forwards } = t.formation;
  if (defenders + midfielders + forwards !== 10) throw new Error(`opponents.mock: ${t.teamId} 포메이션 합계 != 10`);
  const roles = lineRoles(t.formation, t.midStart);
  return TIERS.map((tier): OpponentTeamCard => {
    const skills = t.skills[tier];
    if (skills.length !== 10) throw new Error(`opponents.mock: ${t.teamId} ${tier} 역량 개수 != 10`);
    return {
      id: `op-${t.teamId}-${TIER_SUFFIX[tier]}`,
      teamId: t.teamId,
      teamName: t.teamName,
      tier,
      scoutReport: `${t.flavor} 이 팀은 ${defenders}-${midfielders}-${forwards}로 경기를 합니다.`,
      formation: { defenders, midfielders, forwards },
      goalkeeper: { skill: GK_SKILL[tier], saves: GK_SAVES[tier] },
      sectors: layout(t.formation, skills, roles),
      placeholder: true,
    };
  });
}

export const OPPONENT_CARDS: OpponentTeamCard[] = TEAMS.flatMap(buildTeam);
