import { activeSide } from './cards';
import { swapBenchTokens } from './friday';
import { sectorCounts } from './match';
import type { PlayerInstance, UniformToken } from './state';
import { SECTORS } from './types';
import type { Formation, Sector } from './types';

// 경기 준비 도우미. 클라이언트 UI, 봇, 테스트가 공유한다 (순수 함수)

const SECTOR_NAME: Record<Sector, string> = { LW: '레프트 윙', CB: '센터 백', CM: '센터 미드', CF: '센터 포워드', RW: '라이트 윙' };

// 출전 가능한 선수(부상/출장정지 없음, 등번호 중복 없음, 골키퍼는 1명)를 최대 인원 안에서 고른다
export function eligiblePlayers(player: { roster: PlayerInstance[] }, max = Infinity): string[] {
  const numbers = new Set<number>();
  const chosen: string[] = [];
  let keeper = false;
  for (const inst of player.roster) {
    if (chosen.length >= max) break;
    if (inst.tokens.injury > 0 || inst.tokens.suspension > 0) continue;
    if (activeSide(inst).goalkeeper) {
      if (keeper) continue;
      keeper = true;
    }
    const n = activeSide(inst).number;
    if (n !== undefined) {
      if (numbers.has(n)) continue;
      numbers.add(n);
    }
    chosen.push(inst.instanceId);
  }
  return chosen;
}

// 출전 선수를 고른 뒤 벤치 토큰 교환까지 반영한 필드 토큰
export function previewField(uniforms: UniformToken[], played: string[]): UniformToken[] {
  const clone = structuredClone(uniforms);
  try {
    swapBenchTokens({ uniforms: clone }, played);
  } catch {
    /* 교환할 토큰이 없으면 서버가 거부한다. 미리보기는 현재 필드로 */
  }
  return clone.filter((u) => u.location === 'field');
}

function zonesOf(roster: PlayerInstance[], instanceId: string | undefined): Sector[] | null {
  const inst = instanceId ? roster.find((r) => r.instanceId === instanceId) : undefined;
  return inst ? activeSide(inst).zones : null;
}

// 허용 구획이 적은 출전 선수부터 채우고 나머지 토큰은 남는 자리에. 못 넣은 토큰은 비워둔다
export function autoPlace(field: UniformToken[], roster: PlayerInstance[], played: string[], formation: Formation): Record<string, Sector> {
  const need = sectorCounts(formation);
  const placements: Record<string, Sector> = {};
  const carded = field.filter((u) => u.cardInstanceId && played.includes(u.cardInstanceId));
  carded.sort((a, b) => (zonesOf(roster, a.cardInstanceId)?.length ?? 9) - (zonesOf(roster, b.cardInstanceId)?.length ?? 9));
  for (const token of carded) {
    const sector = zonesOf(roster, token.cardInstanceId)?.find((z) => need[z] > 0);
    if (!sector) continue;
    placements[token.id] = sector;
    need[sector]--;
  }
  // 카드 없는 토큰만 남는 자리에 채운다. 허용 구획이 없어 못 넣은 출전 선수는 미배치로 남긴다
  for (const token of field) {
    if (token.id in placements || (token.cardInstanceId && played.includes(token.cardInstanceId))) continue;
    const sector = SECTORS.find((z) => need[z] > 0);
    if (!sector) break;
    placements[token.id] = sector;
    need[sector]--;
  }
  return placements;
}

export function validatePlacements(field: UniformToken[], roster: PlayerInstance[], played: string[], formation: Formation, placements: Record<string, Sector>): string[] {
  const issues: string[] = [];
  const need = sectorCounts(formation);
  const counts: Record<Sector, number> = { LW: 0, CB: 0, CM: 0, CF: 0, RW: 0 };
  for (const token of field) {
    const sector = placements[token.id];
    if (!sector) {
      issues.push(`토큰 ${token.number ?? '∅'} 미배치`);
      continue;
    }
    counts[sector]++;
    const zones = token.cardInstanceId && played.includes(token.cardInstanceId) ? zonesOf(roster, token.cardInstanceId) : null;
    if (zones && !zones.includes(sector)) issues.push(`토큰 ${token.number ?? '∅'}: ${SECTOR_NAME[sector]} 배치 불가`);
  }
  for (const s of SECTORS) if (counts[s] !== need[s]) issues.push(`${SECTOR_NAME[s]} ${counts[s]}/${need[s]}`);
  return issues;
}

// 자동 배치가 실패한 선수를 빼가며 서버가 받아들일 라인업을 만든다
export function buildLineup(player: { roster: PlayerInstance[]; uniforms: UniformToken[] }, tacticCardId: string, formation: Formation, players: string[]) {
  for (let attempt = players.length; attempt >= 0; attempt--) {
    const field = previewField(player.uniforms, players);
    const placements = autoPlace(field, player.roster, players, formation);
    const issues = validatePlacements(field, player.roster, players, formation, placements);
    if (issues.length === 0) return { tacticCardId, formationIndex: 0, players, placements };
    const unplaced = field.find((t) => !(t.id in placements) && t.cardInstanceId && players.includes(t.cardInstanceId));
    if (!unplaced) break;
    players = players.filter((id) => id !== unplaced.cardInstanceId);
  }
  return null;
}
